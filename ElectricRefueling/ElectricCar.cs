namespace ElectricRefueling;

[Serializable]
public class ElectricCar
{
    public ElectricCar(string model, int currentEnergyLevel, int batteryCapacity, int energyConsumption)
    {
        Model = model;
        CurrentEnergyLevel = currentEnergyLevel;
        BatteryCapacity = batteryCapacity;
        EnergyConsumption = energyConsumption;
    }

    public string Model { get; set; }
    public int CurrentEnergyLevel { get; set; }
    public int BatteryCapacity  { get; set; }
    public int EnergyConsumption { get; set; }
}