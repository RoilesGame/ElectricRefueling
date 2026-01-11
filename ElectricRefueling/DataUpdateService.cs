namespace ElectricRefueling;

/// <summary>
/// Сервис для периодического обновления данных из API
/// </summary>
public class DataUpdateService : IDisposable
{
    private readonly MoscowDataApiClient _apiClient;
    private readonly DataCache _dataCache;
    private readonly Timer _updateTimer;
    private readonly TimeSpan _updateInterval;
    private readonly SemaphoreSlim _updateSemaphore = new SemaphoreSlim(1, 1);
    private bool _isDisposed = false;

    private const int StationsDatasetId = 2985;
    private const int RoadWorksDatasetId = 62101;

    /// <summary>
    /// Создает сервис обновления данных
    /// </summary>
    /// <param name="apiClient">Клиент API</param>
    /// <param name="dataCache">Кэш данных</param>
    /// <param name="updateIntervalMinutes">Интервал обновления в минутах (по умолчанию 60)</param>
    public DataUpdateService(MoscowDataApiClient apiClient, DataCache dataCache, int updateIntervalMinutes = 60)
    {
        _apiClient = apiClient;
        _dataCache = dataCache;
        _updateInterval = TimeSpan.FromMinutes(updateIntervalMinutes);

        // Создаем таймер (первый запуск через 1 секунду, затем по интервалу)
        _updateTimer = new Timer(OnTimerElapsed, null, TimeSpan.FromSeconds(1), _updateInterval);
    }

    /// <summary>
    /// Обработчик таймера - выполняется периодически
    /// </summary>
    private async void OnTimerElapsed(object? state)
    {
        // Предотвращаем одновременные обновления
        if (!await _updateSemaphore.WaitAsync(0))
        {
            return; // Обновление уже выполняется
        }

        try
        {
            await UpdateAllDataAsync();
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[DataUpdateService] Ошибка при обновлении данных: {ex.Message}");
        }
        finally
        {
            _updateSemaphore.Release();
        }
    }

    /// <summary>
    /// Обновить все данные
    /// </summary>
    public async Task UpdateAllDataAsync()
    {
        Console.WriteLine($"[DataUpdateService] Начало обновления данных в {DateTime.Now:HH:mm:ss}");

        // Обновляем станции
        await UpdateStationsAsync();

        // Обновляем дорожные работы
        await UpdateRoadWorksAsync();

        Console.WriteLine($"[DataUpdateService] Обновление завершено в {DateTime.Now:HH:mm:ss}");
    }

    /// <summary>
    /// Обновить данные о станциях
    /// </summary>
    public async Task UpdateStationsAsync()
    {
        try
        {
            Console.WriteLine("[DataUpdateService] Обновление данных о станциях...");
            var stations = await LoadDataWithPaginationAsync<StationData>(StationsDatasetId, 1000);
            _dataCache.UpdateStations(stations);
            Console.WriteLine($"[DataUpdateService] Загружено станций: {stations.Count}");
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[DataUpdateService] Ошибка при обновлении станций: {ex.Message}");
            throw;
        }
    }

    /// <summary>
    /// Обновить данные о дорожных работах
    /// </summary>
    public async Task UpdateRoadWorksAsync()
    {
        try
        {
            Console.WriteLine("[DataUpdateService] Обновление данных о дорожных работах...");
            var roadWorks = await LoadDataWithPaginationAsync<RoadWorkData>(RoadWorksDatasetId, 1000);
            _dataCache.UpdateRoadWorks(roadWorks);
            Console.WriteLine($"[DataUpdateService] Загружено дорожных работ: {roadWorks.Count}");
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[DataUpdateService] Ошибка при обновлении дорожных работ: {ex.Message}");
            throw;
        }
    }

    /// <summary>
    /// Загрузить данные с пагинацией
    /// </summary>
    private async Task<List<T>> LoadDataWithPaginationAsync<T>(int datasetId, int pageSize) where T : new()
    {
        var allItems = new List<T>();
        int skip = 0;
        bool hasMore = true;

        while (hasMore)
        {
            var items = await _apiClient.GetDataAsync<T>(datasetId, pageSize, skip);

            if (items.Count == 0)
            {
                hasMore = false;
                break;
            }

            allItems.AddRange(items);

            if (items.Count < pageSize)
            {
                hasMore = false;
            }
            else
            {
                skip += pageSize;
            }
        }

        return allItems;
    }

    /// <summary>
    /// Принудительно обновить данные сейчас (не ждать таймера)
    /// </summary>
    public async Task ForceUpdateAsync()
    {
        if (!await _updateSemaphore.WaitAsync(0))
        {
            throw new InvalidOperationException("Обновление уже выполняется");
        }

        try
        {
            await UpdateAllDataAsync();
        }
        finally
        {
            _updateSemaphore.Release();
        }
    }

    public void Dispose()
    {
        if (_isDisposed)
            return;

        _updateTimer?.Dispose();
        _updateSemaphore?.Dispose();
        _isDisposed = true;
    }
}
