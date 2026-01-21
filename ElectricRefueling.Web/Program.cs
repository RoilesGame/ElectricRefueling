using System.Text.Json;
using Npgsql;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddHttpClient();
builder.Services.ConfigureHttpJsonOptions(options =>
{
    options.SerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
});

var app = builder.Build();

if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Error");
    app.UseHsts();
}

app.UseHttpsRedirection();
app.UseStaticFiles();
app.UseRouting();

app.MapGet("/", () => Results.Redirect("/frontend/index.html"));

app.MapGet("/api/stations", async (string? query, IConfiguration configuration) =>
{
    var connectionString = configuration.GetConnectionString("ElectricRefueling");
    if (string.IsNullOrWhiteSpace(connectionString))
    {
        return Results.Problem("ConnectionStrings:ElectricRefueling is missing.");
    }

    var normalized = string.IsNullOrWhiteSpace(query) ? null : query.Trim();
    if (normalized != null && normalized.Length > 120)
    {
        return Results.BadRequest("Query is too long.");
    }

    await using var connection = new NpgsqlConnection(connectionString);
    await connection.OpenAsync();

    await using var command = new NpgsqlCommand(@"
        SELECT id, name, station_name, power, balance_holder, adm_area, district, address
        FROM station_data
        WHERE (@query IS NULL OR station_name ILIKE @like OR name ILIKE @like OR address ILIKE @like)
        ORDER BY station_name NULLS LAST
        LIMIT 60;", connection);

    command.Parameters.AddWithValue("query", (object?)normalized ?? DBNull.Value);
    command.Parameters.AddWithValue("like", normalized == null ? DBNull.Value : $"%{normalized}%");

    var results = new List<StationDto>();
    await using var reader = await command.ExecuteReaderAsync();
    while (await reader.ReadAsync())
    {
        results.Add(new StationDto(
            reader.GetInt64(0),
            reader.IsDBNull(1) ? null : reader.GetString(1),
            reader.IsDBNull(2) ? null : reader.GetString(2),
            reader.IsDBNull(3) ? null : reader.GetString(3),
            reader.IsDBNull(4) ? null : reader.GetString(4),
            reader.IsDBNull(5) ? null : reader.GetString(5),
            reader.IsDBNull(6) ? null : reader.GetString(6),
            reader.IsDBNull(7) ? null : reader.GetString(7)));
    }

    return Results.Ok(results);
});

app.MapGet("/api/geocode", async (string query, IHttpClientFactory httpClientFactory, IConfiguration configuration) =>
{
    if (string.IsNullOrWhiteSpace(query))
    {
        return Results.BadRequest("Query is required.");
    }

    var apiKey = configuration["Yandex:ApiKey"];
    if (string.IsNullOrWhiteSpace(apiKey))
    {
        return Results.Problem("Yandex:ApiKey is missing.");
    }

    var client = httpClientFactory.CreateClient();
    var url = $"https://geocode-maps.yandex.ru/1.x/?apikey={Uri.EscapeDataString(apiKey)}&format=json&geocode={Uri.EscapeDataString(query)}";
    using var response = await client.GetAsync(url);
    if (!response.IsSuccessStatusCode)
    {
        return Results.Problem("Geocoder request failed.");
    }

    await using var stream = await response.Content.ReadAsStreamAsync();
    using var doc = await JsonDocument.ParseAsync(stream);
    var root = doc.RootElement;

    var featureMember = root
        .GetProperty("response")
        .GetProperty("GeoObjectCollection")
        .GetProperty("featureMember");

    if (featureMember.GetArrayLength() == 0)
    {
        return Results.NotFound();
    }

    var pos = featureMember[0]
        .GetProperty("GeoObject")
        .GetProperty("Point")
        .GetProperty("pos")
        .GetString();

    if (string.IsNullOrWhiteSpace(pos))
    {
        return Results.NotFound();
    }

    var parts = pos.Split(' ', StringSplitOptions.RemoveEmptyEntries);
    if (parts.Length != 2)
    {
        return Results.NotFound();
    }

    return Results.Ok(new GeocodeResult(parts[1], parts[0]));
});

app.Run();

record StationDto(
    long Id,
    string? Name,
    string? StationName,
    string? Power,
    string? BalanceHolder,
    string? AdmArea,
    string? District,
    string? Address);

record GeocodeResult(string Lat, string Lon);
