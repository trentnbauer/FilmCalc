# Film Cost Calculator

A lightweight, responsive, and mobile-friendly web application designed to help analog photographers calculate the true cost per photo and per roll of their film projects.
I (Google Gemini) created this to help with quickly identifying if film is a good deal or not.

## Features

* **Accurate Cost Breakdown:** Easily calculate costs including film, development, scanning, printing, push/pull fees, and additional surcharges (once-off or per-roll).
* **Logarithmic Push/Pull Math:** Automatically calculates push/pull fees based on the difference between Box Speed and Development Speed.
* **Profile Management:** Save your favorite film stocks and lab pricing profiles locally to your browser for quick calculations in the future.
* **Mobile-First Design:** Fully responsive layout that scales beautifully from smartphone screens to desktop monitors.
* **Dark Mode Support:** Built-in theme toggle to match your system preferences.

## Getting Started

You can access the live calculator hosted on GitHub Pages here: **https://filmcalc.trentbauer.com** - I am planning on adding a docker container in the future for self hosting

### Customizing Defaults

You can pre-load your favorite film stock data by editing the `films.csv` file in the root directory. Use the following format:
`name,boxSpeed,rolls,exposures,devCost,pushPullCost,scanCost,printCost`

## Built With

* [Tailwind CSS](https://tailwindcss.com/) - For styling and responsive layout.
* [Vanilla JavaScript](https://developer.mozilla.org/en-US/docs/Web/JavaScript) - For application logic and local storage management.
* **Vibe coded by Gemini** - Developed in collaboration with Google's Gemini.

## Author

**Trent Bauer**
* Portfolio: [trentbauer.com](https://trentbauer.com)

---
*Created with passion for analog photography and community infrastructure.*
