# 🚗 NZ Road Code Practice Quiz

A free, endless practice quiz for the **New Zealand Road Code** learner licence theory test.

There are no 10-question limits and no end screen. Questions keep coming, every answer is explained, and your progress is saved so you pick up exactly where you left off.

Accessible directly from any modern web browser on smartphones, tablets, laptops, and desktops without requiring app store downloads or in-app purchases.

---

## 🌟 Key Features

* **♾️ Endless practice:** Questions load one after another in a shuffled order. The quiz never shows how many questions there are in total or how far through the bank you are.
* **⏯️ Carries on where you left off:** Your place, your question order and an unanswered question all survive a reload or closing the tab.
* **✅ Quick feedback:** Get it right and the next question loads after 3 seconds (tap *Explain* to stop and read why). Get it wrong and you see the right answer, a Road Code explanation and its page reference, then tap *Next question* when you're ready.
* **🔁 Second chances:** Questions you get wrong come back a few questions later, and questions you haven't seen or have missed before tend to come up sooner.
* **📊 Stats as you go:** The header shows this session's accuracy, score and current streak. Tap it for the full picture.
* **📈 Detailed analytics:** For this session and across every past session saved on the device:
  * Test readiness: how your latest 35 answers compare with the real test (32 of 35 to pass)
  * Accuracy, streaks, time practising and average answer time
  * Every answer as a correct/incorrect timeline, plus running and rolling accuracy charts
  * Accuracy by topic, weakest first
  * A practice calendar, session history, answer speed and time-of-day patterns
  * Your most-missed questions with their answers and explanations
  * Download your data, or reset it
* **📱 Mobile first:** Large tap targets, a layout built for phones, light and dark themes, keyboard shortcuts on desktop, and it can be added to your home screen.

### Keyboard shortcuts

| Key | Action |
| --- | --- |
| `1`–`4` or `A`–`D` | Choose an answer |
| `Enter`, `→` or `N` | Next question |
| `S` | Open your stats |
| `Esc` | Close your stats |

---

## 📂 Question Bank & Topics

222 car (Class 1) questions, each with a picture, an explanation and a Road Code page reference, grouped into 13 topics:

* 🛑 **Intersections** (give way rules, Stop and Give Way signs, roundabouts, traffic signals)
* 🚸 **Signs & signals** (signs, traffic lights, road markings, reflectors)
* 🏎️ **Speed & following distance**
* ↪️ **Lanes & turning**
* 🚙 **Overtaking**
* 🅿️ **Parking**
* 🌧️ **Night & weather**
* 🚶 **Hazards & road users** (pedestrians, cyclists, animals, hazard spotting)
* 🚆 **Rail, bridges & motorways**
* ⚠️ **Emergencies**
* 🍷 **Alcohol & fatigue**
* 🪪 **Licences & law**
* 🔧 **Vehicle & loads**

Questions live in [`data/questions.json`](data/questions.json) and their pictures in [`images/`](images/).

---

## 🛠️ Running Locally

It's a static site with no build step. Serve the folder over HTTP (opening `index.html` straight from disk won't load the questions):

```bash
python -m http.server 8000
```

Then open <http://localhost:8000>.

```text
index.html            Page markup
css/app.css           Styles and themes
js/main.js            Quiz flow, quick stats, theme, keyboard shortcuts
js/store.js           Saved progress, question order and the answer log (localStorage)
js/stats.js           Analytics calculations
js/dashboard.js       The stats sheet
js/charts.js          SVG charts and tooltips
data/questions.json   Question bank
```

Progress is stored in the browser's `localStorage` under `nzrc:v1`, so it stays on that device and browser.

---

## ⚖️ Disclaimer

*This project is an independent educational tool created to assist New Zealand drivers with studying the official road rules. It is not officially affiliated with, endorsed by, or sponsored by the New Zealand Automobile Association (AA) or NZ Transport Agency Waka Kotahi.*

*Always refer to the official [NZTA Road Code](https://www.nzta.govt.nz/roadcode/) for the authoritative legislation and rules.*

---

## 📄 License

Distributed under the **MIT License**. See `LICENSE` for more information.
