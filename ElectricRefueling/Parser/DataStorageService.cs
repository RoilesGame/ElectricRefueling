using Npgsql;

namespace ElectricRefueling;

/// <summary>
/// Сохраняет распарсенные строки датасетов в таблицах PostgreSQL.
/// </summary>
public class DataStorageService
{
    private readonly string _connectionString;

    /// <summary>
    /// Создает сервис хранения с заданной строкой подключения.
    /// </summary>
    public DataStorageService(string connectionString)
    {
        if (string.IsNullOrWhiteSpace(connectionString))
        {
            throw new ArgumentException("Connection string is required.", nameof(connectionString));
        }

        _connectionString = connectionString;
    }

    /// <summary>
    /// Полностью перезаписывает таблицу станций актуальными данными.
    /// </summary>
    public async Task SaveStationsAsync(IReadOnlyList<StationData> stations)
    {
        await using var connection = new NpgsqlConnection(_connectionString);
        await connection.OpenAsync();

        await using var transaction = await connection.BeginTransactionAsync();

        await using (var truncate = new NpgsqlCommand("TRUNCATE TABLE station_data;", connection, transaction))
        {
            await truncate.ExecuteNonQueryAsync();
        }

        await using (var insert = new NpgsqlCommand(
            @"INSERT INTO station_data (number, name, balance_holder, adm_area, district, address)
              VALUES (@number, @name, @balance_holder, @adm_area, @district, @address);",
            connection,
            transaction))
        {
            var numberParam = insert.Parameters.Add("@number", NpgsqlTypes.NpgsqlDbType.Integer);
            var nameParam = insert.Parameters.Add("@name", NpgsqlTypes.NpgsqlDbType.Text);
            var balanceHolderParam = insert.Parameters.Add("@balance_holder", NpgsqlTypes.NpgsqlDbType.Text);
            var admAreaParam = insert.Parameters.Add("@adm_area", NpgsqlTypes.NpgsqlDbType.Text);
            var districtParam = insert.Parameters.Add("@district", NpgsqlTypes.NpgsqlDbType.Text);
            var addressParam = insert.Parameters.Add("@address", NpgsqlTypes.NpgsqlDbType.Text);

            foreach (var station in stations)
            {
                numberParam.Value = station.Number;
                nameParam.Value = ToDbValue(station.Name);
                balanceHolderParam.Value = ToDbValue(station.BalanceHolder);
                admAreaParam.Value = ToDbValue(station.AdmArea);
                districtParam.Value = ToDbValue(station.District);
                addressParam.Value = ToDbValue(station.Address);

                await insert.ExecuteNonQueryAsync();
            }
        }

        await transaction.CommitAsync();
    }

    /// <summary>
    /// Полностью перезаписывает таблицу дорожных работ актуальными данными.
    /// </summary>
    public async Task SaveRoadWorksAsync(IReadOnlyList<RoadWorkData> roadWorks)
    {
        await using var connection = new NpgsqlConnection(_connectionString);
        await connection.OpenAsync();

        await using var transaction = await connection.BeginTransactionAsync();

        await using (var truncate = new NpgsqlCommand("TRUNCATE TABLE road_work_data;", connection, transaction))
        {
            await truncate.ExecuteNonQueryAsync();
        }

        await using (var insert = new NpgsqlCommand(
            @"INSERT INTO road_work_data
              (number, works_type, works_place, work_year, on_territory_of_moscow, adm_area, district,
               works_begin_date, planned_end_date, actual_begin_date, actual_end_date, works_status,
               work_reason, customer, contractor)
              VALUES
              (@number, @works_type, @works_place, @work_year, @on_territory_of_moscow, @adm_area, @district,
               @works_begin_date, @planned_end_date, @actual_begin_date, @actual_end_date, @works_status,
               @work_reason, @customer, @contractor);",
            connection,
            transaction))
        {
            var numberParam = insert.Parameters.Add("@number", NpgsqlTypes.NpgsqlDbType.Integer);
            var worksTypeParam = insert.Parameters.Add("@works_type", NpgsqlTypes.NpgsqlDbType.Text);
            var worksPlaceParam = insert.Parameters.Add("@works_place", NpgsqlTypes.NpgsqlDbType.Text);
            var workYearParam = insert.Parameters.Add("@work_year", NpgsqlTypes.NpgsqlDbType.Integer);
            var onTerritoryParam = insert.Parameters.Add("@on_territory_of_moscow", NpgsqlTypes.NpgsqlDbType.Text);
            var admAreaParam = insert.Parameters.Add("@adm_area", NpgsqlTypes.NpgsqlDbType.Text);
            var districtParam = insert.Parameters.Add("@district", NpgsqlTypes.NpgsqlDbType.Text);
            var worksBeginParam = insert.Parameters.Add("@works_begin_date", NpgsqlTypes.NpgsqlDbType.Text);
            var plannedEndParam = insert.Parameters.Add("@planned_end_date", NpgsqlTypes.NpgsqlDbType.Text);
            var actualBeginParam = insert.Parameters.Add("@actual_begin_date", NpgsqlTypes.NpgsqlDbType.Text);
            var actualEndParam = insert.Parameters.Add("@actual_end_date", NpgsqlTypes.NpgsqlDbType.Text);
            var worksStatusParam = insert.Parameters.Add("@works_status", NpgsqlTypes.NpgsqlDbType.Text);
            var workReasonParam = insert.Parameters.Add("@work_reason", NpgsqlTypes.NpgsqlDbType.Text);
            var customerParam = insert.Parameters.Add("@customer", NpgsqlTypes.NpgsqlDbType.Text);
            var contractorParam = insert.Parameters.Add("@contractor", NpgsqlTypes.NpgsqlDbType.Text);

            foreach (var roadWork in roadWorks)
            {
                numberParam.Value = roadWork.Number;
                worksTypeParam.Value = ToDbValue(roadWork.WorksType);
                worksPlaceParam.Value = ToDbValue(roadWork.WorksPlace);
                workYearParam.Value = roadWork.WorkYear;
                onTerritoryParam.Value = ToDbValue(roadWork.OnTerritoryOfMoscow);
                admAreaParam.Value = ToDbValue(roadWork.AdmArea);
                districtParam.Value = ToDbValue(roadWork.District);
                worksBeginParam.Value = ToDbValue(roadWork.WorksBeginDate);
                plannedEndParam.Value = ToDbValue(roadWork.PlannedEndDate);
                actualBeginParam.Value = ToDbValue(roadWork.ActualBeginDate);
                actualEndParam.Value = ToDbValue(roadWork.ActualEndDate);
                worksStatusParam.Value = ToDbValue(roadWork.WorksStatus);
                workReasonParam.Value = ToDbValue(roadWork.WorkReason);
                customerParam.Value = ToDbValue(roadWork.Customer);
                contractorParam.Value = ToDbValue(roadWork.Contractor);

                await insert.ExecuteNonQueryAsync();
            }
        }

        await transaction.CommitAsync();
    }

    /// <summary>
    /// Преобразует строку в значение для БД с учетом NULL.
    /// </summary>
    private static object ToDbValue(string? value)
    {
        return string.IsNullOrWhiteSpace(value) ? DBNull.Value : value;
    }
}
