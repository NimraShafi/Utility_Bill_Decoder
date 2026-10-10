# Utility Bill Decoder

A React workspace for the WTQ Build Track challenge. Upload IESCO, LESCO, or K-Electric PNG/JPG bills, extract the exact Level 1 JSON schema, answer the 12 Level 2 questions, and download submission-ready CSV files.

## Setup

1. Install Node.js 22 or later.
2. Install dependencies with `npm install`.
3. Copy `.env.example` to `.env` for local configuration.
4. Start the app with `npm run dev`.
5. Open Model settings, choose an allowed provider/model, and paste the API key for the current browser session.

## Output

The workspace generates `level1.csv` with `bill_id,json` and `level2.csv` with `bill_id,question_id,question,answer`. Values are escaped as UTF-8 CSV and Level 1 JSON stays on one line per bill.

## AI Usage

- Google Gemini 3.5 Flash-Lite or Gemini 3.1 Flash-Lite for bill image understanding and grounded plain-English answers.
- OpenAI GPT-4.1 mini or GPT-5 mini can be selected where an approved key is available.
- Anthropic Claude Haiku 4.5 can be selected where an approved key is available.
- AI coding assistance was used to create the application UI, CSV formatting, validation flow, and documentation.

The prompt excludes personal identifiers and requests null values for unavailable fields. Numeric/date normalization and Level 2 fallback calculations are handled by application logic.
