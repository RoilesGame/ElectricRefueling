namespace ElectricRefueling;

/// <summary>
/// Модель каждой строки из датасета с ЭЗС
/// </summary>
public class StationData
{
    public int Number { get; set; }
    public string Name { get; set; } = string.Empty;
    public string BalanceHolder { get; set; } = string.Empty;
    public string AdmArea { get; set; } = string.Empty;
    public string District { get; set; } = string.Empty;
    public string Address { get; set; } = string.Empty;

    public string StationName
    {
        get
        {
            var parts = Name.Split([", "], StringSplitOptions.None);
            return parts.Length > 0 ? parts[0] : string.Empty;
        }
    }

    public string Power
    {
        get
        {
            var parts = Name.Split([", "], StringSplitOptions.None);
            return parts.Length >= 2 ? parts[1] : string.Empty;
        }
    }

    public string AdministrativeDistrict => AdmArea;

    public override string ToString()
    {
        return $"№{Number}: {StationName} | {Power} | {BalanceHolder} | {AdmArea} | {District} | {Address}";
    }
}

