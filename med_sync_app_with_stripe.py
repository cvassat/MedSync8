
import os
import streamlit as st
from supabase import create_client, Client
from datetime import datetime

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://slwbhftsdffvsiazhrjg.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsd2JoZnRzZGZmdnNpYXpocmpnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc2Nzc3NzQsImV4cCI6MjA2MzI1Mzc3NH0.wScgpTbOkRj-Bz-V7IWNvOHBdt_eZ3kpQTr9UGhgz_k")


@st.cache_resource
def get_supabase_client() -> Client:
    return create_client(SUPABASE_URL, SUPABASE_KEY)


supabase = get_supabase_client()


def show_login():
    st.title("Login to Medication Sync App")
    login_tab, signup_tab = st.tabs(["Login", "Sign Up"])

    with login_tab:
        email = st.text_input("Email", key="login_email")
        password = st.text_input("Password", type="password", key="login_password")
        if st.button("Login"):
            try:
                user = supabase.auth.sign_in_with_password({"email": email, "password": password})
                if user:
                    st.session_state['user'] = user
                    st.success("Logged in successfully!")
                    st.rerun()
            except Exception as e:
                st.error("Login failed: " + str(e))

    with signup_tab:
        new_email = st.text_input("New Email", key="signup_email")
        new_password = st.text_input("New Password", type="password", key="signup_password")
        if st.button("Sign Up"):
            try:
                supabase.auth.sign_up({"email": new_email, "password": new_password})
                st.success("Sign-up successful! Please check your email to confirm.")
            except Exception as e:
                st.error("Sign-up failed: " + str(e))


@st.cache_data
def calculate_sync_quantities(current_meds: tuple, new_med_name: str, new_med_dose: int, sync_date_str: str):
    """Pure calculation with no side effects; cached by Streamlit across reruns."""
    results = []
    sync_date = datetime.strptime(sync_date_str, "%Y-%m-%d")
    today = datetime.today().replace(hour=0, minute=0, second=0, microsecond=0)
    days_until_sync = (sync_date - today).days

    if days_until_sync < 0:
        return None, "Sync date must be in the future"

    for med in current_meds:
        days_left = med['remaining'] // med['daily_dose']
        additional_days_needed = days_until_sync - days_left
        units_needed = max(additional_days_needed * med['daily_dose'], 0)
        results.append({
            'name': med['name'],
            'days_left': days_left,
            'units_needed': units_needed,
        })

    new_med_units = new_med_dose * days_until_sync
    results.append({
        'name': new_med_name + " (new)",
        'days_left': 0,
        'units_needed': new_med_units,
    })

    return results, None


if 'user' not in st.session_state:
    show_login()
else:
    st.title("Medication Sync Calculator")

    if st.button("Logout"):
        del st.session_state['user']
        st.rerun()

    if "is_premium" not in st.session_state:
        st.session_state["is_premium"] = False

    st.write("Free users can sync up to 2 medications.")
    if not st.session_state["is_premium"]:
        st.markdown("[👉 Upgrade to Premium for Unlimited Access](https://buy.stripe.com/dRm4gzdjLdw66JQbJ5bsc00)", unsafe_allow_html=True)
        st.warning("You're currently using the free tier.")

    with st.form("med_form"):
        num_meds = st.number_input("Number of existing medications", min_value=0, max_value=10, step=1)

        meds = []
        for i in range(int(num_meds)):
            name = st.text_input(f"Medication {i+1} Name", key=f"name_{i}")
            daily_dose = st.number_input(f"Daily Dose for Medication {i+1}", min_value=1, key=f"dose_{i}")
            remaining = st.number_input(f"Units Remaining for Medication {i+1}", min_value=0, key=f"remaining_{i}")
            meds.append({'name': name, 'daily_dose': daily_dose, 'remaining': remaining})

        st.markdown("### New Medication Details")
        new_name = st.text_input("New Medication Name", key="new_name")
        new_dose = st.number_input("New Medication Daily Dose", min_value=1, key="new_dose")

        sync_date = st.date_input("Desired Sync Date")
        submitted = st.form_submit_button("Calculate")

    if submitted:
        if not st.session_state["is_premium"] and int(num_meds) > 2:
            st.error("Upgrade to premium to sync more than 2 medications.")
        else:
            result, error = calculate_sync_quantities(
                tuple(tuple(sorted(m.items())) for m in meds),
                new_name,
                int(new_dose),
                sync_date.strftime("%Y-%m-%d"),
            )
            if error:
                st.error(error)
            elif result:
                st.subheader("Sync Plan")
                for med in result:
                    st.write(f"**{med['name']}**: {med['units_needed']} units needed to sync by {sync_date}")
