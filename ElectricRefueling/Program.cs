namespace ElectricRefueling;

class Program
{
    private static DataCache? _dataCache;
    private static DataUpdateService? _updateService;

    static async Task Main(string[] args)
    {
        // Создаем кэш данных
        _dataCache = new DataCache();

        using var apiClient = new MoscowDataApiClient();

        try
        {
            // Создаем сервис обновления данных (обновление каждые 60 минут)
            // Можно изменить интервал, например: new DataUpdateService(apiClient, _dataCache, 30) для обновления каждые 30 минут
            _updateService = new DataUpdateService(apiClient, _dataCache, updateIntervalMinutes: 60);

            // Первая загрузка данных (синхронная)
            Console.WriteLine("Первоначальная загрузка данных...");
            await _updateService.UpdateAllDataAsync();

            // Выводим статистику
            Console.WriteLine($"\nЗагружено станций: {_dataCache.StationsCount}");
            Console.WriteLine($"Загружено дорожных работ: {_dataCache.RoadWorksCount}");
            Console.WriteLine($"Время последнего обновления станций: {_dataCache.StationsLastUpdate:yyyy-MM-dd HH:mm:ss}");
            Console.WriteLine($"Время последнего обновления дорожных работ: {_dataCache.RoadWorksLastUpdate:yyyy-MM-dd HH:mm:ss}");
            
            Console.WriteLine("\nСервис обновления данных запущен. Данные будут автоматически обновляться.");
            Console.WriteLine("Нажмите любую клавишу для выхода...\n");

            // Пример использования данных из кэша
            await DemonstrateDataUsageAsync();

            // Ожидание нажатия клавиши (в реальном приложении здесь может быть ваш основной цикл)
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

    /// <summary>
    /// Пример использования данных из кэша
    /// </summary>
    static async Task DemonstrateDataUsageAsync()
    {
        // Имитация работы приложения
        for (int i = 0; i < 3; i++)
        {
            await Task.Delay(2000);

            if (_dataCache == null) continue;

            var stations = _dataCache.GetStations();
            var roadWorks = _dataCache.GetRoadWorks();

            Console.WriteLine($"[Демонстрация {i + 1}] Получено из кэша:");
            Console.WriteLine($"  - Станций: {stations.Count}");
            Console.WriteLine($"  - Дорожных работ: {roadWorks.Count}");

            // Пример поиска ближайшей станции (заглушка)
            if (stations.Count > 0)
            {
                var firstStation = stations[0];
                Console.WriteLine($"  - Пример станции: {firstStation.StationName} ({firstStation.Address})");
            }
        }
    }
}