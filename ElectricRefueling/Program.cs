using Microsoft.Extensions.Configuration;

namespace ElectricRefueling;

class Program
{
    private static DataCache? _dataCache;
    private static DataUpdateService? _updateService;

    static async Task Main(string[] args)
    {
        _dataCache = new DataCache();

        var configuration = new ConfigurationBuilder()
            .SetBasePath(AppContext.BaseDirectory)
            .AddJsonFile("appsettings.json", optional: true)
            .AddEnvironmentVariables()
            .Build();

        var apiKey = configuration["MoscowData:ApiKey"];
        var baseUrl = configuration["MoscowData:BaseUrl"];
        var updateIntervalMinutes = configuration.GetValue<int?>("MoscowData:UpdateIntervalMinutes") ?? 60;
        var connectionString = configuration.GetConnectionString("ElectricRefueling");

        if (string.IsNullOrWhiteSpace(apiKey))
        {
            throw new InvalidOperationException("MoscowData: API-ключ не найден.");
        }
        if (string.IsNullOrWhiteSpace(connectionString))
        {
            throw new InvalidOperationException("ConnectionStrings: ElectricRefueling не найден.");
        }

        using var apiClient = new MoscowDataApiClient(apiKey, baseUrl);
        var dataStorage = new DataStorageService(connectionString);

        try
        {
            _updateService = new DataUpdateService(
                apiClient,
                _dataCache,
                dataStorage,
                updateIntervalMinutes: updateIntervalMinutes);

            Console.WriteLine("Первоначальная загрузка данных...");
            await _updateService.UpdateAllDataAsync();

            Console.WriteLine($"\nКоличество станций: {_dataCache.StationsCount}");
            Console.WriteLine($"Количество дорожных работ: {_dataCache.RoadWorksCount}");
            Console.WriteLine($"Последнее обновление станций: {_dataCache.StationsLastUpdate:yyyy-MM-dd HH:mm:ss}");
            Console.WriteLine($"Последнее обновление дорожных работ: {_dataCache.RoadWorksLastUpdate:yyyy-MM-dd HH:mm:ss}");

            Console.WriteLine("\nДемонстрация работы с данными завершена. Программа готова к использованию.");
            Console.WriteLine("Нажмите любую клавишу для завершения...\n");
            await DemonstrateDataUsageAsync();

            Console.ReadKey();
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Произошла ошибка: {ex.Message}");
            Console.WriteLine($"StackTrace: {ex.StackTrace}");
        }
        finally
        {
            _updateService?.Dispose();
        }
    }

    static async Task DemonstrateDataUsageAsync()
    {
        for (int i = 0; i < 3; i++)
        {
            await Task.Delay(2000);

            if (_dataCache == null) continue;

            var stations = _dataCache.GetStations();
            var roadWorks = _dataCache.GetRoadWorks();

            Console.WriteLine($"[Демонстрация {i + 1}] Получено из кэша:");
            Console.WriteLine($" - Станций: {stations.Count}");
            Console.WriteLine($" - Дорожных работ: {roadWorks.Count}");

            if (stations.Count > 0)
            {
                var firstStation = stations[0];
                Console.WriteLine($" - Пример станции: {firstStation.StationName} ({firstStation.Address})");
            }
        }
    }
}

