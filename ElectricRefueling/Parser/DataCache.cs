namespace ElectricRefueling;

/// <summary>
/// Класс для хранения и управления кэшем данных датасетов
/// </summary>
public class DataCache
{
    private List<StationData> _stations = new List<StationData>();
    private List<RoadWorkData> _roadWorks = new List<RoadWorkData>();
    private readonly object _stationsLock = new object();
    private readonly object _roadWorksLock = new object();
    private DateTime _stationsLastUpdate = DateTime.MinValue;
    private DateTime _roadWorksLastUpdate = DateTime.MinValue;

    /// <summary>
    /// Получить копию списка станций (потокобезопасно)
    /// </summary>
    public List<StationData> GetStations()
    {
        lock (_stationsLock)
        {
            return new List<StationData>(_stations);
        }
    }

    /// <summary>
    /// Получить копию списка дорожных работ (потокобезопасно)
    /// </summary>
    public List<RoadWorkData> GetRoadWorks()
    {
        lock (_roadWorksLock)
        {
            return new List<RoadWorkData>(_roadWorks);
        }
    }

    /// <summary>
    /// Обновить список станций (потокобезопасно)
    /// </summary>
    public void UpdateStations(List<StationData> newStations)
    {
        lock (_stationsLock)
        {
            _stations = new List<StationData>(newStations);
            _stationsLastUpdate = DateTime.Now;
        }
    }

    /// <summary>
    /// Обновить список дорожных работ (потокобезопасно)
    /// </summary>
    public void UpdateRoadWorks(List<RoadWorkData> newRoadWorks)
    {
        lock (_roadWorksLock)
        {
            _roadWorks = new List<RoadWorkData>(newRoadWorks);
            _roadWorksLastUpdate = DateTime.Now;
        }
    }

    /// <summary>
    /// Время последнего обновления станций
    /// </summary>
    public DateTime StationsLastUpdate => _stationsLastUpdate;

    /// <summary>
    /// Время последнего обновления дорожных работ
    /// </summary>
    public DateTime RoadWorksLastUpdate => _roadWorksLastUpdate;

    /// <summary>
    /// Количество станций
    /// </summary>
    public int StationsCount
    {
        get
        {
            lock (_stationsLock)
            {
                return _stations.Count;
            }
        }
    }

    /// <summary>
    /// Количество дорожных работ
    /// </summary>
    public int RoadWorksCount
    {
        get
        {
            lock (_roadWorksLock)
            {
                return _roadWorks.Count;
            }
        }
    }
}
