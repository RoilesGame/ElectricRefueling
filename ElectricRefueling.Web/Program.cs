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

app.MapPost("/api/register", async (RegisterRequest request, IConfiguration configuration) =>
{
    var connectionString = GetConnectionString(configuration);
    if (connectionString == null)
    {
        return Results.Problem("ConnectionStrings:ElectricRefueling is missing.");
    }

    var username = request.Username?.Trim();
    var password = request.Password ?? string.Empty;
    if (string.IsNullOrWhiteSpace(username) || username.Length < 3 || password.Length < 6)
    {
        return Results.BadRequest("Invalid username or password.");
    }

    await using var connection = new NpgsqlConnection(connectionString);
    await connection.OpenAsync();

    await using (var exists = new NpgsqlCommand("SELECT 1 FROM app_user WHERE username = @username;", connection))
    {
        exists.Parameters.AddWithValue("username", username);
        var alreadyExists = await exists.ExecuteScalarAsync();
        if (alreadyExists != null)
        {
            return Results.Conflict("Username already exists.");
        }
    }

    var hash = BCrypt.Net.BCrypt.HashPassword(password);
    await using var insert = new NpgsqlCommand(
        "INSERT INTO app_user (username, password_hash) VALUES (@username, @hash) RETURNING id;",
        connection);
    insert.Parameters.AddWithValue("username", username);
    insert.Parameters.AddWithValue("hash", hash);

    var userId = (long)(await insert.ExecuteScalarAsync() ?? 0);
    return Results.Ok(new AuthResponse(userId));
});

app.MapPost("/api/login", async (LoginRequest request, IConfiguration configuration) =>
{
    var connectionString = GetConnectionString(configuration);
    if (connectionString == null)
    {
        return Results.Problem("ConnectionStrings:ElectricRefueling is missing.");
    }

    var username = request.Username?.Trim();
    if (string.IsNullOrWhiteSpace(username) || string.IsNullOrWhiteSpace(request.Password))
    {
        return Results.BadRequest("Invalid username or password.");
    }

    await using var connection = new NpgsqlConnection(connectionString);
    await connection.OpenAsync();

    await using var select = new NpgsqlCommand(
        "SELECT id, password_hash FROM app_user WHERE username = @username;",
        connection);
    select.Parameters.AddWithValue("username", username);

    await using var reader = await select.ExecuteReaderAsync();
    if (!await reader.ReadAsync())
    {
        return Results.Unauthorized();
    }

    var userId = reader.GetInt64(0);
    var hash = reader.GetString(1);
    if (!BCrypt.Net.BCrypt.Verify(request.Password, hash))
    {
        return Results.Unauthorized();
    }

    return Results.Ok(new AuthResponse(userId));
});

app.MapGet("/api/cars", async (string? query, IConfiguration configuration) =>
{
    var connectionString = GetConnectionString(configuration);
    if (connectionString == null)
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
        SELECT id, brand, model, range_km, efficiency_wh_km, fast_charge_kmh, rapid_charge, power_train, plug_type
        FROM electric_car
        WHERE (CAST(@query AS text) IS NULL OR brand ILIKE CAST(@like AS text) OR model ILIKE CAST(@like AS text))
        ORDER BY brand, model
        LIMIT 100;", connection);

    command.Parameters.Add("query", NpgsqlTypes.NpgsqlDbType.Text).Value = (object?)normalized ?? DBNull.Value;
    command.Parameters.Add("like", NpgsqlTypes.NpgsqlDbType.Text).Value = normalized == null ? DBNull.Value : $"%{normalized}%";

    var results = new List<ElectricCarDto>();
    await using var reader = await command.ExecuteReaderAsync();
    while (await reader.ReadAsync())
    {
        results.Add(new ElectricCarDto(
            reader.GetInt64(0),
            reader.IsDBNull(1) ? null : reader.GetString(1),
            reader.IsDBNull(2) ? null : reader.GetString(2),
            reader.IsDBNull(3) ? null : reader.GetInt32(3),
            reader.IsDBNull(4) ? null : reader.GetInt32(4),
            reader.IsDBNull(5) ? null : reader.GetInt32(5),
            reader.IsDBNull(6) ? null : reader.GetBoolean(6),
            reader.IsDBNull(7) ? null : reader.GetString(7),
            reader.IsDBNull(8) ? null : reader.GetString(8)));
    }

    return Results.Ok(results);
});

app.MapGet("/api/user-cars", async (long userId, IConfiguration configuration) =>
{
    if (userId <= 0)
    {
        return Results.BadRequest("User id is required.");
    }

    var connectionString = GetConnectionString(configuration);
    if (connectionString == null)
    {
        return Results.Problem("ConnectionStrings:ElectricRefueling is missing.");
    }

    await using var connection = new NpgsqlConnection(connectionString);
    await connection.OpenAsync();

    await using var command = new NpgsqlCommand(@"
        SELECT c.id, c.brand, c.model, c.range_km, c.efficiency_wh_km, c.fast_charge_kmh,
               c.rapid_charge, c.power_train, c.plug_type, uc.alias
        FROM user_car uc
        JOIN electric_car c ON c.id = uc.car_id
        WHERE uc.user_id = @user_id
        ORDER BY c.brand, c.model;", connection);
    command.Parameters.AddWithValue("user_id", userId);

    var results = new List<UserCarDto>();
    await using var reader = await command.ExecuteReaderAsync();
    while (await reader.ReadAsync())
    {
        results.Add(new UserCarDto(
            reader.GetInt64(0),
            reader.IsDBNull(1) ? null : reader.GetString(1),
            reader.IsDBNull(2) ? null : reader.GetString(2),
            reader.IsDBNull(3) ? null : reader.GetInt32(3),
            reader.IsDBNull(4) ? null : reader.GetInt32(4),
            reader.IsDBNull(5) ? null : reader.GetInt32(5),
            reader.IsDBNull(6) ? null : reader.GetBoolean(6),
            reader.IsDBNull(7) ? null : reader.GetString(7),
            reader.IsDBNull(8) ? null : reader.GetString(8),
            reader.IsDBNull(9) ? null : reader.GetString(9)));
    }

    return Results.Ok(results);
});

app.MapPost("/api/user-cars", async (UserCarRequest request, IConfiguration configuration) =>
{
    if (request.UserId <= 0 || request.CarId <= 0)
    {
        return Results.BadRequest("Invalid user or car id.");
    }

    var connectionString = GetConnectionString(configuration);
    if (connectionString == null)
    {
        return Results.Problem("ConnectionStrings:ElectricRefueling is missing.");
    }

    await using var connection = new NpgsqlConnection(connectionString);
    await connection.OpenAsync();

    await using var command = new NpgsqlCommand(@"
        INSERT INTO user_car (user_id, car_id, alias)
        VALUES (@user_id, @car_id, @alias)
        ON CONFLICT (user_id, car_id)
        DO UPDATE SET alias = EXCLUDED.alias;", connection);
    command.Parameters.AddWithValue("user_id", request.UserId);
    command.Parameters.AddWithValue("car_id", request.CarId);
    command.Parameters.AddWithValue("alias", (object?)request.Alias?.Trim() ?? DBNull.Value);

    await command.ExecuteNonQueryAsync();
    return Results.Ok();
});

app.MapDelete("/api/user-cars/{carId:long}", async (long carId, long userId, IConfiguration configuration) =>
{
    if (userId <= 0 || carId <= 0)
    {
        return Results.BadRequest("Invalid user or car id.");
    }

    var connectionString = GetConnectionString(configuration);
    if (connectionString == null)
    {
        return Results.Problem("ConnectionStrings:ElectricRefueling is missing.");
    }

    await using var connection = new NpgsqlConnection(connectionString);
    await connection.OpenAsync();

    await using var command = new NpgsqlCommand(
        "DELETE FROM user_car WHERE user_id = @user_id AND car_id = @car_id;",
        connection);
    command.Parameters.AddWithValue("user_id", userId);
    command.Parameters.AddWithValue("car_id", carId);

    await command.ExecuteNonQueryAsync();
    return Results.Ok();
});

app.MapGet("/api/stations", async (string? query, IConfiguration configuration) =>
{
    var connectionString = GetConnectionString(configuration);
    if (connectionString == null)
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
        WHERE (CAST(@query AS text) IS NULL OR station_name ILIKE CAST(@like AS text) OR name ILIKE CAST(@like AS text) OR address ILIKE CAST(@like AS text))
        ORDER BY station_name NULLS LAST
        LIMIT 60;", connection);

    command.Parameters.Add("query", NpgsqlTypes.NpgsqlDbType.Text).Value = (object?)normalized ?? DBNull.Value;
    command.Parameters.Add("like", NpgsqlTypes.NpgsqlDbType.Text).Value = normalized == null ? DBNull.Value : $"%{normalized}%";

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

app.MapGet("/api/roadworks", async (IConfiguration configuration) =>
{
    var connectionString = GetConnectionString(configuration);
    if (connectionString == null)
    {
        return Results.Problem("ConnectionStrings:ElectricRefueling is missing.");
    }

    await using var connection = new NpgsqlConnection(connectionString);
    await connection.OpenAsync();

    await using var command = new NpgsqlCommand(@"
        SELECT works_place, works_begin_date, planned_end_date, actual_end_date, works_status
        FROM road_work_data
        WHERE works_place IS NOT NULL
          AND works_place <> ''
          AND LOWER(TRIM(works_status)) = 'идут';", connection);

    var results = new List<RoadWorkDto>();
    await using var reader = await command.ExecuteReaderAsync();
    while (await reader.ReadAsync())
    {
        results.Add(new RoadWorkDto(
            reader.IsDBNull(0) ? null : reader.GetString(0),
            reader.IsDBNull(1) ? null : reader.GetString(1),
            reader.IsDBNull(2) ? null : reader.GetString(2),
            reader.IsDBNull(3) ? null : reader.GetString(3),
            reader.IsDBNull(4) ? null : reader.GetString(4)));
    }

    return Results.Ok(results);
});


app.MapGet("/api/plug-ranges", async (IConfiguration configuration) =>
{
    var connectionString = GetConnectionString(configuration);
    if (connectionString == null)
    {
        return Results.Problem("ConnectionStrings:ElectricRefueling is missing.");
    }

    await using var connection = new NpgsqlConnection(connectionString);
    await connection.OpenAsync();

    await using var command = new NpgsqlCommand(@"
        SELECT plug_type, min_power_kw, max_power_kw
        FROM plug_power_range
        ORDER BY plug_type;", connection);

    var results = new List<PlugRangeDto>();
    await using var reader = await command.ExecuteReaderAsync();
    while (await reader.ReadAsync())
    {
        results.Add(new PlugRangeDto(
            reader.GetString(0),
            reader.GetInt32(1),
            reader.GetInt32(2)));
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

static string? GetConnectionString(IConfiguration configuration)
{
    var connectionString = configuration.GetConnectionString("ElectricRefueling");
    return string.IsNullOrWhiteSpace(connectionString) ? null : connectionString;
}

record StationDto(
    long Id,
    string? Name,
    string? StationName,
    string? Power,
    string? BalanceHolder,
    string? AdmArea,
    string? District,
    string? Address);

record PlugRangeDto(string PlugType, int MinPowerKw, int MaxPowerKw);

record GeocodeResult(string Lat, string Lon);
record RoadWorkDto(string? WorksPlace, string? WorksBeginDate, string? PlannedEndDate, string? ActualEndDate, string? WorksStatus);

record RegisterRequest(string Username, string Password);
record LoginRequest(string Username, string Password);
record AuthResponse(long UserId);

record ElectricCarDto(
    long Id,
    string? Brand,
    string? Model,
    int? RangeKm,
    int? EfficiencyWhKm,
    int? FastChargeKmH,
    bool? RapidCharge,
    string? PowerTrain,
    string? PlugType);

record UserCarRequest(long UserId, long CarId, string? Alias);
record UserCarDto(
    long Id,
    string? Brand,
    string? Model,
    int? RangeKm,
    int? EfficiencyWhKm,
    int? FastChargeKmH,
    bool? RapidCharge,
    string? PowerTrain,
    string? PlugType,
    string? Alias);
