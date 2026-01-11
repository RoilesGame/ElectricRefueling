namespace ElectricRefueling;

/// <summary>
/// Модель каждой строки из датасета о запланированных дорожных работах
/// </summary>
public class RoadWorkData
{
    public int Number { get; set; }
    public string WorksType { get; set; } = string.Empty;
    public string WorksPlace { get; set; } = string.Empty;
    public int WorkYear { get; set; }
    
    public string OnTerritoryOfMoscow { get; set; } = string.Empty;
    public string AdmArea { get; set; } = string.Empty;
    public string District { get; set; } = string.Empty;
    public string WorksBeginDate { get; set; } = string.Empty;
    public string PlannedEndDate { get; set; } = string.Empty;
    public string ActualBeginDate { get; set; } = string.Empty;
    public string ActualEndDate { get; set; } = string.Empty;
    public string WorksStatus { get; set; } = string.Empty;
    public string WorkReason { get; set; } = string.Empty;
    public string Customer { get; set; } = string.Empty;
    public string Contractor { get; set; } = string.Empty;

    private bool _onTerritoryOfMoscowBool;
    
    public bool OnTerritoryOfMoscowBool
    {
        get
        {
            return OnTerritoryOfMoscow?.ToLower().Trim() == "да";
        }
        set
        {
            _onTerritoryOfMoscowBool = value;
        }
    }
    
    public override string ToString()
    {
        return $"{Number} | {WorksType} | {WorksPlace} | {WorkYear} | {OnTerritoryOfMoscowBool} | {AdmArea} | {District} | {WorksBeginDate} | {PlannedEndDate} | {ActualBeginDate} | {ActualEndDate} | {WorksStatus} | {WorkReason} | {Customer} | {Contractor}";
    }
}

