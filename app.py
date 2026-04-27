import os
import time
from collections import defaultdict
from datetime import datetime
from flask import Flask, request, jsonify, send_file, Response
from flask_cors import CORS
from groq import Groq
import pytz

from prompts.brook_prompt import get_brook_prompt

app = Flask(__name__)
CORS(app, origins=[
    "https://www.westbrookdental.ca",
    "https://westbrookdental.ca",
    "https://web-production-b09ad.up.railway.app/"
])

groq_api_key = os.environ.get("GROQ_API_KEY", "")
if not groq_api_key:
    raise ValueError("GROQ_API_KEY environment variable not set")
client = Groq(api_key=groq_api_key)

API_SECRET_KEY = os.environ.get("API_SECRET_KEY", "")

# ─── GOOGLE SHEETS ANALYTICS ──────────────────────────────────────────────────

def log_to_sheet(user_message, bot_reply, is_open, location="Unknown"):
    try:
        import json
        sheet_id             = os.environ.get("GOOGLE_SHEET_ID", "")
        sheet_name           = os.environ.get("GOOGLE_SHEET_NAME", "Sheet1")
        service_account_json = os.environ.get("GOOGLE_SERVICE_ACCOUNT_JSON", "")
        if not sheet_id or not service_account_json:
            return
        from google.oauth2.service_account import Credentials
        from googleapiclient.discovery import build
        creds_info = json.loads(service_account_json)
        creds = Credentials.from_service_account_info(
            creds_info, scopes=["https://www.googleapis.com/auth/spreadsheets"]
        )
        service = build("sheets", "v4", credentials=creds)
        winnipeg_tz = pytz.timezone("America/Winnipeg")
        now         = datetime.now(winnipeg_tz)
        row = [[
            now.strftime("%Y-%m-%d %H:%M:%S"),
            f"Westbrook Dental — {location}",
            now.strftime("%A"),
            now.strftime("%H:00"),
            "Open" if is_open else "Closed",
            user_message[:500],
            bot_reply[:500],
        ]]
        service.spreadsheets().values().append(
            spreadsheetId=sheet_id,
            range=f"{sheet_name}!A:G",
            valueInputOption="RAW",
            insertDataOption="INSERT_ROWS",
            body={"values": row}
        ).execute()
    except Exception as e:
        print(f"[Sheets logging error] {e}")


# ─── AUTH ─────────────────────────────────────────────────────────────────────

def verify_api_key(req):
    key = req.headers.get("X-API-Key") or req.args.get("api_key")
    return key == API_SECRET_KEY

@app.route("/")
def index():
    return send_file("templates/index.html")

@app.route("/static/brook_widget.js")
def serve_widget():
    from flask import Response
    with open("static/brook_widget.js", "r") as f:
        js = f.read()
    api_url = "https://" + os.environ.get("RAILWAY_PUBLIC_DOMAIN", "").strip()
    js = js.replace("{{BROOK_API}}", api_url)
    js = js.replace("{{BROOK_KEY}}", API_SECRET_KEY)
    return Response(js, mimetype="application/javascript")


# ─── RATE LIMITING ────────────────────────────────────────────────────────────

request_counts = defaultdict(list)
RATE_LIMIT  = 20
RATE_WINDOW = 60

def is_rate_limited(ip):
    now = time.time()
    request_counts[ip] = [t for t in request_counts[ip] if now - t < RATE_WINDOW]
    if len(request_counts[ip]) >= RATE_LIMIT:
        return True
    request_counts[ip].append(now)
    return False


# ─── TIME HELPER ──────────────────────────────────────────────────────────────

def get_brook_is_open(location=None):
    try:
        winnipeg_tz = pytz.timezone("America/Winnipeg")
        now  = datetime.now(winnipeg_tz)
        day  = now.strftime("%A")
        hour = now.hour + now.minute / 60

        hours_by_location = {
            "st_marys": {
                "Monday": (8, 17), "Tuesday": (8, 17), "Wednesday": (8, 17),
                "Thursday": (8, 17), "Friday": (8, 17), "Saturday": None, "Sunday": None
            },
            "keewatin": {
                "Monday": (10, 17), "Tuesday": (9, 19), "Wednesday": (9, 17),
                "Thursday": (9, 19), "Friday": (9, 16), "Saturday": (9, 16), "Sunday": None
            },
            "sargent": {
                "Monday": None, "Tuesday": (9, 16), "Wednesday": (9, 16),
                "Thursday": (12, 19), "Friday": (12, 17), "Saturday": (9, 16), "Sunday": None
            }
        }

        if location and location in hours_by_location:
            schedule = hours_by_location[location]
        else:
            schedule = hours_by_location["keewatin"]

        today = schedule.get(day)
        if not today:
            return False
        return today[0] <= hour < today[1]
    except:
        return False


# ─── GUARDRAILS ───────────────────────────────────────────────────────────────

JAILBREAK_PHRASES = [
    "ignore previous instructions", "ignore your instructions",
    "forget your instructions", "pretend you are", "pretend to be",
    "act as", "you are now", "new persona", "override", "bypass",
    "print your prompt", "reveal your instructions", "show your instructions",
    "what are your rules", "disregard", "do anything now", "dan mode", "jailbreak",
]
EMERGENCY_PHRASES = [
    "severe pain", "unbearable pain", "cant sleep from pain", "can't sleep from pain",
    "tooth knocked out", "knocked out tooth", "knocked-out tooth",
    "abscess", "facial swelling", "jaw swelling",
    "uncontrolled bleeding", "won't stop bleeding", "wont stop bleeding",
    "dental emergency", "urgent dental",
]
ANXIETY_PHRASES = [
    "scared", "afraid", "fear", "terrified", "nervous", "anxiety", "anxious",
    "dreading", "hate the dentist", "phobia", "panic",
    "haven't been in years", "havent been in years", "avoid the dentist",
]
RUDE_PHRASES = ["fuck", "shit", "bitch", "asshole", "stupid", "idiot", "dumb", "useless"]

def is_jailbreak(msg): return any(p in msg.lower() for p in JAILBREAK_PHRASES)
def is_emergency(msg): return any(p in msg.lower() for p in EMERGENCY_PHRASES)
def is_anxiety(msg):   return any(p in msg.lower() for p in ANXIETY_PHRASES)
def is_rude(msg):      return any(p in msg.lower() for p in RUDE_PHRASES)

LOCATION_PHONES = {
    "st_marys":  "(204) 694-1400",
    "keewatin":  "(204) 633-6200",
    "sargent":   "(204) 786-7625",
}


# ─── BROOK CHAT ROUTE ─────────────────────────────────────────────────────────

@app.route("/brook/chat", methods=["POST"])
def brook_chat():
    if not verify_api_key(request):
        return jsonify({"error": "Unauthorized"}), 401

    ip = request.headers.get("X-Forwarded-For", request.remote_addr)
    if is_rate_limited(ip):
        return jsonify({"reply": "You are sending messages too quickly. Please wait a moment and try again."}), 429

    data     = request.json
    user_msg = data.get("message", "")
    history  = data.get("history", [])
    location = data.get("location", None)  # st_marys / keewatin / sargent

    is_open  = get_brook_is_open(location)
    phone    = LOCATION_PHONES.get(location, "(204) 694-1400")
    loc_name = {
        "st_marys": "St. Mary's Road",
        "keewatin": "Keewatin Street",
        "sargent":  "Sargent Avenue"
    }.get(location, "your nearest location")

    if is_jailbreak(user_msg):
        reply = "I am here to help with questions about Westbrook Dental Group. Is there anything I can help you with?"
        log_to_sheet(user_msg, reply, is_open, loc_name)
        return jsonify({"reply": reply})

    if is_rude(user_msg):
        reply = "I am here to help with dental questions. Please keep the conversation respectful."
        log_to_sheet(user_msg, reply, is_open, loc_name)
        return jsonify({"reply": reply})

    if is_emergency(user_msg):
        reply = f"Please call us immediately at {phone}. If it is after hours and severe, please go to a hospital emergency room or call 911."
        log_to_sheet(user_msg, reply, is_open, loc_name)
        return jsonify({"reply": reply})

    if is_anxiety(user_msg):
        reply = "That is completely okay — you are not alone and we will not judge you. Our team has been caring for patients for over 50 years and we will always go at your pace."
        log_to_sheet(user_msg, reply, is_open, loc_name)
        return jsonify({"reply": reply})

    system_prompt = get_brook_prompt(is_open, location)
    messages = [{"role": "system", "content": system_prompt}]
    messages.extend(history[-6:])
    messages.append({"role": "user", "content": user_msg})

    error_msg = (
        f"Sorry, I am having trouble right now. Please give us a call at {phone}."
        if is_open else
        "Sorry, I am having trouble right now. Please book online and our team will confirm during business hours."
    )

    try:
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=messages
        )
        reply = response.choices[0].message.content
        log_to_sheet(user_msg, reply, is_open, loc_name)
        return jsonify({"reply": reply})
    except Exception as e:
        log_to_sheet(user_msg, error_msg, is_open, loc_name)
        return jsonify({"reply": error_msg})


if __name__ == "__main__":
    app.run(debug=True)
