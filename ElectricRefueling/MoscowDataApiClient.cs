using System.Text.Json;
using System.Text.Json.Serialization;

namespace ElectricRefueling;

public class MoscowDataApiClient : IDisposable
{
    private readonly HttpClient _httpClient;
    private readonly string _apiKey;
    private readonly JsonSerializerOptions _jsonOptions;
    private const string DefaultBaseUrl = "https://apidata.mos.ru/v1/datasets";

    public MoscowDataApiClient(string apiKey, string? baseUrl = null)
    {
        if (string.IsNullOrWhiteSpace(apiKey))
        {
            throw new ArgumentException("API key is required.", nameof(apiKey));
        }

        _apiKey = apiKey;
        _httpClient = new HttpClient
        {
            BaseAddress = new Uri($"{baseUrl ?? DefaultBaseUrl}/")
        };

        _jsonOptions = new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true,
            NumberHandling = JsonNumberHandling.AllowReadingFromString
        };
        _jsonOptions.Converters.Add(new StringOrArrayConverter());
        _jsonOptions.Converters.Add(new BoolFromStringConverter());
    }

    public async Task<List<T>> GetDataAsync<T>(int datasetId, int top = 1000, int skip = 0) where T : new()
    {
        var url = $"{datasetId}/rows?$top={top}&$skip={skip}&api_key={_apiKey}";

        try
        {
            var response = await _httpClient.GetAsync(url);
            var jsonResponse = await response.Content.ReadAsStringAsync();
            response.EnsureSuccessStatusCode();

            using var jsonDoc = JsonDocument.Parse(jsonResponse);
            var items = new List<T>();
            var rootElement = jsonDoc.RootElement;

            IEnumerable<JsonElement> elements = rootElement.ValueKind == JsonValueKind.Array
                ? rootElement.EnumerateArray()
                : rootElement.TryGetProperty("Items", out var itemsProp) && itemsProp.ValueKind == JsonValueKind.Array
                    ? itemsProp.EnumerateArray()
                    : Enumerable.Empty<JsonElement>();

            foreach (var item in elements)
            {
                var targetElement = item.ValueKind == JsonValueKind.Object &&
                                    item.TryGetProperty("Cells", out var cells) &&
                                    cells.ValueKind == JsonValueKind.Object
                    ? cells
                    : item;

                var parsedItem = targetElement.Deserialize<T>(_jsonOptions);
                if (parsedItem != null)
                {
                    items.Add(parsedItem);
                }
            }

            return items;
        }
        catch (HttpRequestException ex)
        {
            throw new Exception($"HTTP request failed: {ex.Message}", ex);
        }
        catch (Exception ex)
        {
            throw new Exception($"Failed to fetch data: {ex.Message}", ex);
        }
    }

    private sealed class StringOrArrayConverter : JsonConverter<string>
    {
        public override string Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
        {
            if (reader.TokenType == JsonTokenType.String)
            {
                return reader.GetString() ?? string.Empty;
            }

            if (reader.TokenType == JsonTokenType.StartArray)
            {
                var items = new List<string>();
                while (reader.Read() && reader.TokenType != JsonTokenType.EndArray)
                {
                    if (reader.TokenType == JsonTokenType.String)
                    {
                        var value = reader.GetString();
                        if (!string.IsNullOrEmpty(value))
                        {
                            items.Add(value);
                        }
                    }
                    else
                    {
                        using var doc = JsonDocument.ParseValue(ref reader);
                        items.Add(doc.RootElement.GetRawText());
                    }
                }

                return items.Count == 0 ? string.Empty : string.Join(", ", items);
            }

            if (reader.TokenType == JsonTokenType.StartObject)
            {
                using var doc = JsonDocument.ParseValue(ref reader);
                return doc.RootElement.GetRawText();
            }

            return string.Empty;
        }

        public override void Write(Utf8JsonWriter writer, string value, JsonSerializerOptions options)
        {
            writer.WriteStringValue(value);
        }
    }

    private sealed class BoolFromStringConverter : JsonConverter<bool>
    {
        public override bool Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
        {
            if (reader.TokenType == JsonTokenType.True || reader.TokenType == JsonTokenType.False)
            {
                return reader.GetBoolean();
            }

            if (reader.TokenType == JsonTokenType.String &&
                bool.TryParse(reader.GetString(), out var value))
            {
                return value;
            }

            return false;
        }

        public override void Write(Utf8JsonWriter writer, bool value, JsonSerializerOptions options)
        {
            writer.WriteBooleanValue(value);
        }
    }

    public void Dispose()
    {
        _httpClient?.Dispose();
        GC.SuppressFinalize(this);
    }
}
