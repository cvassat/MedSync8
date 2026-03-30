import os

import streamlit as st
from supabase import create_client, Client
from datetime import datetime

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "")

if not SUPABASE_URL or not SUPABASE_KEY:
    st.error("Missing SUPABASE_URL or SUPABASE_KEY environment variables. Please configure them before running.")
    st.stop()

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)


def show_login():
    st.title("Login to Medication Sync App")
    login_tab, signup_tab = st.tabs(["Login", "Sign Up"])

    with login_tab:
        email = st.text_input("Email", key="login_email")
        password = st.text_input("Password", type="password", key="login_password")
        if st.button("Login"):
            if not email or not password:
                st.error("Please enter both email and password.")
            else:
                try:
                    user = supabase.auth.sign_in_with_password({"email": email, "password": password})
                    if user:
                        st.session_state['user'] = user
                        st.success("Logged in successfully!")
                        st.rerun()
                except Exception:
                    st.error("Login failed. Please check your credentials.")

    with signup_tab:
        new_email = st.text_input("New Email", key="signup_email")
        new_password = st.text_input("New Password", type="password", key="signup_password")
        if st.button("Sign Up"):
            if not new_email or not new_password:
                st.error("Please enter both email and password.")
            else:
                try:
                    supabase.auth.sign_up({"email": new_email, "password": new_password})
                    st.success("Sign-up successful! Please check your email to confirm.")
                except Exception:
                    st.error("Sign-up failed. Please try again.")


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


if 'user' not in st.session_state:
    show_login()
else:
    st.title("Medication Sync Calculator")

    if st.sidebar.button("Logout"):
        supabase.auth.sign_out()
        del st.session_state['user']
        st.rerun()

    if "is_premium" not in st.session_state:
        st.session_state["is_premium"] = False

    stripe_link = os.environ.get("STRIPE_PAYMENT_LINK", "")

    st.write("Free users can sync up to 2 medications.")
    if not st.session_state["is_premium"]:
        if stripe_link and stripe_link.startswith("https://"):
            st.markdown(f"[Upgrade to Premium for Unlimited Access]({stripe_link})")
        st.warning("You're currently using the free tier.")

    with st.form("med_form"):
        num_meds = st.number_input("Number of existing medications", min_value=0, max_value=10, step=1)
        if not st.session_state["is_premium"] and num_meds > 2:
            st.error("Upgrade to premium to sync more than 2 medications.")
            st.stop()

        meds = []
        for i in range(num_meds):
            name = st.text_input(f"Medication {i+1} Name", key=f"name_{i}")
            daily_dose = st.number_input(f"Daily Dose for Medication {i+1}", min_value=1, key=f"dose_{i}")
            remaining = st.number_input(f"Units Remaining for Medication {i+1}", min_value=0, key=f"remaining_{i}")
            meds.append({'name': name, 'daily_dose': daily_dose, 'remaining': remaining})

        st.markdown("### New Medication Details")
        new_name = st.text_input("New Medication Name", key="new_name")
        new_dose = st.number_input("New Medication Daily Dose", min_value=1, key="new_dose")
        new_med = {'name': new_name, 'daily_dose': new_dose}

        sync_date = st.date_input("Desired Sync Date")
        submitted = st.form_submit_button("Calculate")

    if submitted:
        result = calculate_sync_quantities(meds, new_med, sync_date.strftime("%Y-%m-%d"))
        if result:
            st.subheader("Sync Plan")
            for med in result:
                st.write(f"**{med['name']}**: {med['units_needed']} units needed to sync by {sync_date}")
        elif (sync_date - datetime.today().date()).days < 0:
            st.error("Sync date must be in the future.")
