from datetime import datetime


def calculate_sync_quantities(current_meds, new_med, sync_date):
    results = []
    sync_date = datetime.strptime(sync_date, "%Y-%m-%d")
    today = datetime.today().replace(hour=0, minute=0, second=0, microsecond=0)
    days_until_sync = (sync_date - today).days

    if days_until_sync < 0:
        return []

    for med in current_meds:
        if med['daily_dose'] <= 0:
            continue
        days_left = med['remaining'] // med['daily_dose']
        additional_days_needed = days_until_sync - days_left
        units_needed = max(additional_days_needed * med['daily_dose'], 0)
        results.append({
            'name': med['name'],
            'days_left': days_left,
            'units_needed': units_needed
        })

    if new_med['daily_dose'] > 0:
        new_med_units = new_med['daily_dose'] * days_until_sync
        results.append({
            'name': new_med['name'] + " (new)",
            'days_left': 0,
            'units_needed': new_med_units
        })

    return results
