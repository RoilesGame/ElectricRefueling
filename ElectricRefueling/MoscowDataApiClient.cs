using System.Reflection;
using System.Text.Json;

namespace ElectricRefueling;

public class MoscowDataApiClient : IDisposable
{
    private readonly HttpClient _httpClient;
    private readonly string _apiKey = "bf00a39f-8efd-4c2a-ac28-3e2d8dac7ad9";
    private const string BaseUrl = "https://apidata.mos.ru/v1/datasets";

    public MoscowDataApiClient()
    {
        _httpClient = new HttpClient();
        _httpClient.BaseAddress = new Uri(BaseUrl + "/");
    }

    /// <summary>
    /// Универсальный метод для получения данных из любого датасета
    /// </summary>
    public async Task<List<T>> GetDataAsync<T>(int datasetId, int top = 1000, int skip = 0) where T : new()
    {
        var url = $"{datasetId}/rows?$top={top}&$skip={skip}&api_key={_apiKey}";
        
        try
        {
            var response = await _httpClient.PostAsync(url, null);
            
            var jsonResponse = await response.Content.ReadAsStringAsync();
            
            if (!response.IsSuccessStatusCode)
            {
                response.EnsureSuccessStatusCode();
            }
            
            var jsonDoc = JsonDocument.Parse(jsonResponse);
            var items = new List<T>();
            var rootElement = jsonDoc.RootElement;

            IEnumerable<JsonElement> elements = rootElement.ValueKind == JsonValueKind.Array
                ? rootElement.EnumerateArray()
                : rootElement.TryGetProperty("Items", out var itemsProp) && itemsProp.ValueKind == JsonValueKind.Array
                    ? itemsProp.EnumerateArray()
                    : Enumerable.Empty<JsonElement>();

            foreach (var item in elements)
            {
                var parsedItem = ParseItem<T>(item);
                if (parsedItem != null)
                {
                    items.Add(parsedItem);
                }
            }

            return items;
        }
        catch (HttpRequestException ex)
        {
            throw new Exception($"Ошибка HTTP при запросе к API: {ex.Message}", ex);
        }
        catch (Exception ex)
        {
            throw new Exception($"Ошибка при запросе к API: {ex.Message}", ex);
        }
    }


    /// <summary>
    /// Универсальный метод парсинга JSON элемента в объект типа T
    /// Автоматически сопоставляет имена свойств JSON с именами свойств класса
    /// </summary>
    private T? ParseItem<T>(JsonElement item) where T : new()
    {
        try
        {
            var obj = new T();
            var type = typeof(T);
            var properties = type.GetProperties(BindingFlags.Public | BindingFlags.Instance);

            JsonElement? cellsElement = null;
            if (item.TryGetProperty("Cells", out var cells) && cells.ValueKind == JsonValueKind.Object)
            {
                cellsElement = cells;
            }

            foreach (var property in properties)
            {
                if (!property.CanWrite)
                    continue;

                JsonElement? valueElement = null;

                if (item.ValueKind == JsonValueKind.Object && item.TryGetProperty(property.Name, out var topLevelProp))
                {
                    valueElement = topLevelProp;
                }
                else if (cellsElement.HasValue && cellsElement.Value.TryGetProperty(property.Name, out var cellsProp))
                {
                    valueElement = cellsProp;
                }

                if (!valueElement.HasValue)
                    continue;

                SetPropertyValue(obj, property, valueElement.Value);
            }

            return obj;
        }
        catch
        {
            return default;
        }
    }

    /// <summary>
    /// Устанавливает значение свойства объекта из JSON элемента
    /// </summary>
    private void SetPropertyValue(object obj, PropertyInfo property, JsonElement jsonElement)
    {
        try
        {
            var propertyType = property.PropertyType;

            if (jsonElement.ValueKind == JsonValueKind.Null)
            {
                return;
            }

            if (propertyType == typeof(string))
            {
                if (jsonElement.ValueKind == JsonValueKind.Array)
                {
                    var arrayElements = jsonElement.EnumerateArray().ToList();
                    if (arrayElements.Count > 0)
                    {
                        var stringValues = new List<string>();
                        foreach (var element in arrayElements)
                        {
                            if (element.ValueKind == JsonValueKind.String)
                            {
                                var str = element.GetString();
                                if (!string.IsNullOrEmpty(str))
                                {
                                    stringValues.Add(str);
                                }
                            }
                            else if (element.ValueKind == JsonValueKind.Object)
                            {
                                stringValues.Add(element.GetRawText());
                            }
                        }
                        
                        if (stringValues.Count == 1)
                        {
                            property.SetValue(obj, stringValues[0]);
                        }
                        else if (stringValues.Count > 1)
                        {
                            property.SetValue(obj, string.Join(", ", stringValues));
                        }
                        else
                        {
                            property.SetValue(obj, string.Empty);
                        }
                    }
                    else
                    {
                        property.SetValue(obj, string.Empty);
                    }
                }
                else
                {
                    property.SetValue(obj, jsonElement.GetString() ?? string.Empty);
                }
            }
            else if (propertyType == typeof(int) || propertyType == typeof(int?))
            {
                if (jsonElement.ValueKind == JsonValueKind.Number)
                {
                    property.SetValue(obj, jsonElement.GetInt32());
                }
                else if (jsonElement.ValueKind == JsonValueKind.String && int.TryParse(jsonElement.GetString(), out int num))
                {
                    property.SetValue(obj, num);
                }
            }
            else if (propertyType == typeof(long) || propertyType == typeof(long?))
            {
                if (jsonElement.ValueKind == JsonValueKind.Number)
                {
                    property.SetValue(obj, jsonElement.GetInt64());
                }
                else if (jsonElement.ValueKind == JsonValueKind.String && long.TryParse(jsonElement.GetString(), out long num))
                {
                    property.SetValue(obj, num);
                }
            }
            else if (propertyType == typeof(double) || propertyType == typeof(double?))
            {
                if (jsonElement.ValueKind == JsonValueKind.Number)
                {
                    property.SetValue(obj, jsonElement.GetDouble());
                }
                else if (jsonElement.ValueKind == JsonValueKind.String && double.TryParse(jsonElement.GetString(), out double num))
                {
                    property.SetValue(obj, num);
                }
            }
            else if (propertyType == typeof(bool) || propertyType == typeof(bool?))
            {
                if (jsonElement.ValueKind == JsonValueKind.True || jsonElement.ValueKind == JsonValueKind.False)
                {
                    property.SetValue(obj, jsonElement.GetBoolean());
                }
                else if (jsonElement.ValueKind == JsonValueKind.String && bool.TryParse(jsonElement.GetString(), out bool val))
                {
                    property.SetValue(obj, val);
                }
            }
            else if (propertyType == typeof(DateTime) || propertyType == typeof(DateTime?))
            {
                if (jsonElement.ValueKind == JsonValueKind.String && DateTime.TryParse(jsonElement.GetString(), out DateTime dateTime))
                {
                    property.SetValue(obj, dateTime);
                }
            }
        }
        catch
        {
        }
    }

    public void Dispose()
    {
        _httpClient?.Dispose();
        GC.SuppressFinalize(this);
    }
}

