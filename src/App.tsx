import { ChangeEvent, DragEvent, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowDownToLine,
  Check,
  ChevronDown,
  FileImage,
  FileJson,
  HelpCircle,
  History,
  KeyRound,
  LoaderCircle,
  Menu,
  MessageSquareText,
  Plus,
  RefreshCw,
  ScanLine,
  Settings2,
  Sparkles,
  UploadCloud,
  X,
  Zap,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

type Provider = 'KE' | 'LESCO' | 'IESCO';
type ModelProvider = 'google' | 'openai' | 'anthropic';
type ChargeType = 'energy' | 'fixed' | 'fpa' | 'quarterly_adjustment' | 'surcharge' | 'meter_rent' | 'subsidy' | 'other';
type TaxType = 'gst' | 'electricity_duty' | 'income_tax' | 'municipal_tax' | 'other_tax';

type BillExtraction = {
  provider: Provider | null;
  tariff: string | null;
  sanctioned_load_kw: number | null;
  bill_month: string | null;
  reading_date: string | null;
  issue_date: string | null;
  due_date: string | null;
  previous_reading: number | null;
  current_reading: number | null;
  units_consumed: number | null;
  charges: { type: ChargeType; amount: number }[];
  total_charges: number | null;
  taxes: { type: TaxType; amount: number }[];
  total_taxes: number | null;
  current_bill: number | null;
  arrears: number | null;
  payable_within_due_date: number | null;
  payable_after_due_date: number | null;
};

type Answer = { question_id: string; question: string; answer: string };
type Bill = { id: string; file: File; preview: string; extraction: BillExtraction | null; answers: Answer[]; status: 'ready' | 'processing' | 'complete' | 'error'; error?: string };

const questions: { id: string; text: string }[] = [
  { id: 'Q1', text: 'What is my total current bill and when is it due?' },
  { id: 'Q2', text: 'How many units did I consume this month?' },
  { id: 'Q3', text: 'What was my previous and current meter reading?' },
  { id: 'Q4', text: 'How much of my bill is taxes and duties?' },
  { id: 'Q5', text: 'What are the main charges on this bill?' },
  { id: 'Q6', text: 'How much will I pay if I miss the due date?' },
  { id: 'Q7', text: 'What tariff or category is printed on my bill?' },
  { id: 'Q8', text: 'What billing month does this bill cover?' },
  { id: 'Q9', text: 'How much are my arrears or previous dues?' },
  { id: 'Q10', text: 'What is the difference between my readings?' },
  { id: 'Q11', text: 'Which charge is the largest?' },
  { id: 'Q12', text: 'Can you summarize this bill in plain English?' },
];

const emptyExtraction: BillExtraction = {
  provider: null, tariff: null, sanctioned_load_kw: null, bill_month: null, reading_date: null, issue_date: null, due_date: null,
  previous_reading: null, current_reading: null, units_consumed: null, charges: [], total_charges: null, taxes: [], total_taxes: null,
  current_bill: null, arrears: null, payable_within_due_date: null, payable_after_due_date: null,
};

const sampleExtraction: BillExtraction = {
  provider: 'LESCO', tariff: 'A-2(a)(04)', sanctioned_load_kw: 1, bill_month: '2026-08', reading_date: '2026-08-26', issue_date: '2026-08-29', due_date: '2026-09-09',
  previous_reading: 22238, current_reading: 22303, units_consumed: 65,
  charges: [{ type: 'energy', amount: 3777.49 }, { type: 'surcharge', amount: 176 }], total_charges: 3777.49,
  taxes: [{ type: 'gst', amount: 1723.51 }], total_taxes: 1723.51, current_bill: 5501, arrears: 39411, payable_within_due_date: 44912, payable_after_due_date: 45263,
};

const fieldLabels: { key: keyof BillExtraction; label: string }[] = [
  { key: 'provider', label: 'Provider' }, { key: 'tariff', label: 'Tariff' }, { key: 'sanctioned_load_kw', label: 'Sanctioned load' }, { key: 'bill_month', label: 'Bill month' },
  { key: 'reading_date', label: 'Reading date' }, { key: 'issue_date', label: 'Issue date' }, { key: 'due_date', label: 'Due date' }, { key: 'previous_reading', label: 'Previous reading' },
  { key: 'current_reading', label: 'Current reading' }, { key: 'units_consumed', label: 'Units consumed' }, { key: 'total_charges', label: 'Total charges' }, { key: 'total_taxes', label: 'Total taxes' },
  { key: 'current_bill', label: 'Current bill' }, { key: 'arrears', label: 'Arrears' }, { key: 'payable_within_due_date', label: 'Payable by due date' }, { key: 'payable_after_due_date', label: 'Payable after due date' },
];

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'Not printed';
  if (typeof value === 'number') return value.toLocaleString('en-PK');
  return String(value);
}

function csvCell(value: string | number): string {
  const text = String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function makeCsv(rows: (string | number)[][]): string {
  return rows.map((row) => row.map((cell) => csvCell(cell)).join(',')).join('\n');
}

function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([`\ufeff${content}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function parseJsonResponse(text: string): unknown {
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  return JSON.parse(cleaned);
}

function buildLevel2Answers(extraction: BillExtraction, modelAnswers: Answer[] | undefined): Answer[] {
  if (modelAnswers?.length === questions.length) return modelAnswers;
  const largest = extraction.charges.length ? extraction.charges.reduce((a, b) => a.amount >= b.amount ? a : b) : null;
  const difference = extraction.current_reading !== null && extraction.previous_reading !== null ? extraction.current_reading - extraction.previous_reading : null;
  const taxPercent = extraction.current_bill && extraction.total_taxes !== null ? ((extraction.total_taxes / extraction.current_bill) * 100).toFixed(1) : null;
  const answers: Record<string, string> = {
    Q1: `The current bill is PKR ${formatValue(extraction.current_bill)} and the due date is ${formatValue(extraction.due_date)}.`,
    Q2: `The bill shows ${formatValue(extraction.units_consumed)} units consumed.`,
    Q3: `The previous reading is ${formatValue(extraction.previous_reading)} and the current reading is ${formatValue(extraction.current_reading)}.`,
    Q4: `Taxes total PKR ${formatValue(extraction.total_taxes)}${taxPercent ? `, which is approximately ${taxPercent}% of the current bill` : ''}.`,
    Q5: extraction.charges.length ? `The bill lists ${extraction.charges.map((item) => `${item.type.replace(/_/g, ' ')} (PKR ${formatValue(item.amount)})`).join(', ')}.` : 'No individual charge lines were printed.',
    Q6: `The amount after the due date is PKR ${formatValue(extraction.payable_after_due_date)}.`,
    Q7: `The printed tariff is ${formatValue(extraction.tariff)}.`,
    Q8: `This bill covers ${formatValue(extraction.bill_month)}.`,
    Q9: `Arrears or previous dues are PKR ${formatValue(extraction.arrears)}.`,
    Q10: difference === null ? 'The reading difference cannot be calculated because one reading is not printed.' : `The readings differ by ${difference} units.`,
    Q11: largest ? `The largest listed charge is ${largest.type.replace(/_/g, ' ')} at PKR ${formatValue(largest.amount)}.` : 'No charge lines were printed.',
    Q12: `This ${formatValue(extraction.provider)} bill records ${formatValue(extraction.units_consumed)} units for ${formatValue(extraction.bill_month)}. The current bill is PKR ${formatValue(extraction.current_bill)}, payable by ${formatValue(extraction.due_date)}.`,
  };
  return questions.map((question) => ({ question_id: question.id, question: question.text, answer: answers[question.id] }));
}

async function callModel(provider: ModelProvider, model: string, apiKey: string, image: string): Promise<{ extraction: BillExtraction; answers?: Answer[] }> {
  const instruction = `You are an exacting utility bill analyst. Read this electricity bill image. Return JSON only with this shape: {"extraction": ${JSON.stringify(emptyExtraction)}, "answers": [{"question_id":"Q1","question":"...","answer":"..."}]}. Extract only visible, non-identifying details. Never include names, addresses, CNIC, account/reference/consumer/meter numbers. Use null when absent, [] for empty arrays, numeric values as numbers, credits as negative numbers, dates YYYY-MM-DD and months YYYY-MM. Keep printed values without recalculation. Answer all twelve questions in plain English strictly from the bill; label estimates. Questions: ${JSON.stringify(questions)}.`;
  if (provider === 'google') {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: instruction }, { inline_data: { mime_type: 'image/jpeg', data: image.split(',')[1] } }] }], generationConfig: { temperature: 0.1, responseMimeType: 'application/json' } }),
    });
    if (!response.ok) throw new Error('The model could not read this bill. Check the API key and model settings.');
    const data = await response.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('The model returned an empty result.');
    return parseJsonResponse(text) as { extraction: BillExtraction; answers?: Answer[] };
  }
  const endpoint = provider === 'openai' ? 'https://api.openai.com/v1/chat/completions' : 'https://api.anthropic.com/v1/messages';
  const body = provider === 'openai'
    ? { model, messages: [{ role: 'user', content: [{ type: 'text', text: instruction }, { type: 'image_url', image_url: { url: image } }] }], temperature: 0.1 }
    : { model, max_tokens: 4000, messages: [{ role: 'user', content: [{ type: 'text', text: instruction }, { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image.split(',')[1] } }] }] };
  const headers: Record<string, string> = { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` };
  if (provider === 'anthropic') { headers['x-api-key'] = apiKey; headers['anthropic-version'] = '2023-06-01'; delete headers.Authorization; }
  const response = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!response.ok) throw new Error('The model could not read this bill. Check the API key and model settings.');
  const data = await response.json() as { choices?: { message?: { content?: string } }[]; content?: { text?: string }[] };
  const text = data.choices?.[0]?.message?.content ?? data.content?.[0]?.text;
  if (!text) throw new Error('The model returned an empty result.');
  return parseJsonResponse(text) as { extraction: BillExtraction; answers?: Answer[] };
}

function App() {
  const [bills, setBills] = useState<Bill[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'extraction' | 'answers'>('overview');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [modelProvider, setModelProvider] = useState<ModelProvider>('google');
  const [modelName, setModelName] = useState('gemini-3.5-flash-lite');
  const [notice, setNotice] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const selected = bills.find((bill) => bill.id === selectedId) ?? bills[0];
  const completedBills = bills.filter((bill) => bill.status === 'complete');
  const totalUnits = completedBills.reduce((total, bill) => total + (bill.extraction?.units_consumed ?? 0), 0);
  const progress = bills.length ? Math.round((completedBills.length / bills.length) * 100) : 0;

  const addFiles = (files: FileList | File[]): void => {
    const valid = Array.from(files).filter((file) => ['image/png', 'image/jpeg', 'image/jpg'].includes(file.type));
    const newBills = valid.map((file) => ({ id: `${file.name}-${file.lastModified}`, file, preview: URL.createObjectURL(file), extraction: null, answers: [], status: 'ready' as const }));
    setBills((current) => [...current, ...newBills]);
    if (!selectedId && newBills[0]) setSelectedId(newBills[0].id);
    if (valid.length !== Array.from(files).length) setNotice('Only PNG and JPG bill images were added.');
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>): void => { if (event.target.files) addFiles(event.target.files); event.target.value = ''; };
  const handleDrop = (event: DragEvent<HTMLDivElement>): void => { event.preventDefault(); setIsDragging(false); addFiles(event.dataTransfer.files); };

  const processBills = async (): Promise<void> => {
    if (!apiKey) { setIsSettingsOpen(true); setNotice('Add an API key before processing bills.'); return; }
    if (!bills.length) { setNotice('Upload at least one bill image first.'); return; }
    setIsProcessing(true); setNotice('Reading your bills with the selected model…');
    for (const bill of bills) {
      setBills((current) => current.map((item) => item.id === bill.id ? { ...item, status: 'processing', error: undefined } : item));
      try {
        const image = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('Unable to read image.')); reader.readAsDataURL(bill.file); });
        const result = await callModel(modelProvider, modelName, apiKey, image);
        const extraction = { ...emptyExtraction, ...result.extraction };
        const answers = buildLevel2Answers(extraction, result.answers);
        setBills((current) => current.map((item) => item.id === bill.id ? { ...item, extraction, answers, status: 'complete' } : item));
        if (supabase) await supabase.from('bill_decoder_runs').insert({ bill_id: bill.file.name.replace(/\.[^.]+$/, ''), file_name: bill.file.name, provider: extraction.provider, extraction, answers });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'This bill could not be processed.';
        setBills((current) => current.map((item) => item.id === bill.id ? { ...item, status: 'error', error: message } : item));
      }
    }
    setIsProcessing(false); setNotice('Processing complete. Review the results or download the submission files.');
  };

  const loadSample = (): void => {
    const sample = new File(['sample'], 'LESCO_sample.jpg', { type: 'image/jpeg' });
    const sampleBill: Bill = { id: 'sample-lesco', file: sample, preview: '', extraction: sampleExtraction, answers: buildLevel2Answers(sampleExtraction, undefined), status: 'complete' };
    setBills([sampleBill]); setSelectedId(sampleBill.id); setNotice('Loaded a representative LESCO review so you can explore the workspace.');
  };

  const level1Csv = useMemo(() => makeCsv([['bill_id', 'json'], ...completedBills.map((bill) => [bill.file.name.replace(/\.[^.]+$/, ''), JSON.stringify(bill.extraction ?? emptyExtraction)])]), [completedBills]);
  const level2Csv = useMemo(() => makeCsv([['bill_id', 'question_id', 'question', 'answer'], ...completedBills.flatMap((bill) => bill.answers.map((answer) => [bill.file.name.replace(/\.[^.]+$/, ''), answer.question_id, answer.question, answer.answer]))]), [completedBills]);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand"><div className="brand-mark"><Zap size={19} fill="currentColor" /></div><div><strong>Utility Bill Decoder</strong><span>Women Tech Quest · Build Track</span></div></div>
        <div className="topbar-actions"><div className="secure-pill"><span className="status-dot" /> Local workspace</div><button className="icon-button mobile-menu" aria-label="Open menu"><Menu size={20} /></button><button className="settings-button" onClick={() => setIsSettingsOpen(true)}><Settings2 size={17} /> Model settings</button></div>
      </header>

      <main className="workspace">
        <section className="hero"><div><div className="eyebrow"><Sparkles size={14} /> LEVEL 1 + LEVEL 2 WORKSPACE</div><h1>Make every bill<br /><em>make sense.</em></h1><p>Upload electricity bills, extract the details that matter, and turn dense charges into clear answers.</p></div><div className="hero-orbit"><div className="orbit-ring ring-one" /><div className="orbit-ring ring-two" /><div className="orbit-center"><ScanLine size={30} /></div></div></section>

        <section className="stats-row"><div className="stat-card"><div className="stat-icon blue"><FileImage size={18} /></div><div><span>Bills in workspace</span><strong>{bills.length.toString().padStart(2, '0')}</strong></div></div><div className="stat-card"><div className="stat-icon green"><Check size={18} /></div><div><span>Ready for export</span><strong>{completedBills.length.toString().padStart(2, '0')}</strong></div></div><div className="stat-card"><div className="stat-icon amber"><Zap size={18} /></div><div><span>Units reviewed</span><strong>{totalUnits.toLocaleString('en-PK')}</strong></div></div><div className="progress-card"><div className="progress-copy"><span>Workspace progress</span><strong>{progress}%</strong></div><div className="progress-track"><div style={{ width: `${progress}%` }} /></div></div></section>

        {notice && <div className="notice"><AlertCircle size={16} /><span>{notice}</span><button onClick={() => setNotice('')}><X size={15} /></button></div>}

        <section className="content-grid">
          <aside className="sidebar-panel">
            <div className="panel-heading"><div><span className="section-kicker">SOURCE FILES</span><h2>Your bills <small>{bills.length}</small></h2></div><button className="round-button" onClick={() => document.getElementById('bill-upload')?.click()} aria-label="Add bill"><Plus size={18} /></button></div>
            <div className={`dropzone ${isDragging ? 'dragging' : ''}`} onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }} onDragLeave={() => setIsDragging(false)} onDrop={handleDrop}><input id="bill-upload" type="file" accept=".png,.jpg,.jpeg" multiple onChange={handleFileChange} /><UploadCloud size={24} /><strong>Drop bills here</strong><span>or click to browse · PNG/JPG</span></div>
            <div className="file-list">{bills.length === 0 ? <div className="empty-files"><FileImage size={22} /><p>No bills added yet</p><span>Start with the sample or upload your own images.</span><button onClick={loadSample}>Explore sample <ArrowDownToLine size={14} /></button></div> : bills.map((bill) => <button key={bill.id} className={`file-item ${selected?.id === bill.id ? 'active' : ''}`} onClick={() => { setSelectedId(bill.id); setActiveTab('overview'); }}><div className="file-thumb">{bill.preview ? <img src={bill.preview} alt="" /> : <FileImage size={20} />}</div><div className="file-meta"><strong>{bill.file.name}</strong><span>{bill.status === 'complete' ? 'Decoded' : bill.status === 'processing' ? 'Reading…' : bill.status === 'error' ? 'Needs attention' : 'Ready to process'}</span></div><span className={`file-status ${bill.status}`} />{selected?.id === bill.id && <ChevronDown size={15} className="selected-chevron" />}</button>)}</div>
            <div className="sidebar-footer"><button className="history-link"><History size={15} /> Recent runs <span>Stored safely</span></button></div>
          </aside>

          <section className="detail-panel">
            {!selected ? <div className="blank-state"><div className="blank-icon"><MessageSquareText size={28} /></div><h2>Your bill story starts here</h2><p>Upload a bill to see extracted details, charge breakdowns, and plain-English answers in one place.</p><button className="primary-button" onClick={() => document.getElementById('bill-upload')?.click()}><UploadCloud size={17} /> Add your first bill</button></div> : <><div className="detail-header"><div><span className="section-kicker">BILL REVIEW</span><h2>{selected.file.name.replace(/\.[^.]+$/, '')}</h2><p>{selected.extraction?.provider ?? 'Provider pending'} · {selected.extraction?.bill_month ?? 'Awaiting extraction'}</p></div><div className="detail-actions">{selected.status === 'complete' && <span className="decoded-badge"><Check size={14} /> Decoded</span>}<button className="secondary-button" onClick={processBills} disabled={isProcessing}><RefreshCw size={15} className={isProcessing ? 'spin' : ''} /> {isProcessing ? 'Processing' : 'Process bills'}</button></div></div>
              {selected.status === 'error' && <div className="error-card"><AlertCircle size={18} /><div><strong>We couldn’t read this bill</strong><span>{selected.error}</span></div></div>}
              {selected.status !== 'complete' ? <div className="processing-state"><div className="processing-icon"><LoaderCircle size={28} className="spin" /></div><h3>{selected.status === 'processing' ? 'Reading bill details…' : 'Ready for a careful read'}</h3><p>{selected.status === 'processing' ? 'The model is checking dates, readings, charges, and taxes.' : 'Choose your model in settings, then process this bill to generate the submission-ready files.'}</p></div> : <><div className="bill-summary"><div className="summary-image">{selected.preview ? <img src={selected.preview} alt="Uploaded utility bill" /> : <div className="sample-image"><FileImage size={34} /><span>Sample bill preview</span></div>}</div><div className="summary-copy"><div className="summary-topline"><span className="provider-tag">{selected.extraction?.provider}</span><span className="summary-month">{selected.extraction?.bill_month}</span></div><h3>Bill overview</h3><p>Key printed values are ready to review. Personal identifiers are excluded from the result.</p><div className="summary-metrics"><div><span>Current bill</span><strong>PKR {formatValue(selected.extraction?.current_bill)}</strong></div><div><span>Units used</span><strong>{formatValue(selected.extraction?.units_consumed)}</strong></div><div><span>Due date</span><strong>{formatValue(selected.extraction?.due_date)}</strong></div></div></div></div>
                <div className="tabs"><button className={activeTab === 'overview' ? 'active' : ''} onClick={() => setActiveTab('overview')}>Overview</button><button className={activeTab === 'extraction' ? 'active' : ''} onClick={() => setActiveTab('extraction')}><FileJson size={15} /> Level 1 JSON</button><button className={activeTab === 'answers' ? 'active' : ''} onClick={() => setActiveTab('answers')}><MessageSquareText size={15} /> Level 2 answers <span>{selected.answers.length}</span></button></div>
                {activeTab === 'overview' && <div className="overview-grid"><div className="info-block"><div className="block-title"><span>Billing details</span><FileImage size={16} /></div>{fieldLabels.slice(0, 10).map((field) => <div className="detail-row" key={field.key}><span>{field.label}</span><strong>{formatValue(selected.extraction?.[field.key])}</strong></div>)}</div><div className="info-block"><div className="block-title"><span>Charges & totals</span><Zap size={16} /></div>{selected.extraction?.charges.map((charge, index) => <div className="detail-row" key={`${charge.type}-${index}`}><span>{charge.type.replace(/_/g, ' ')}</span><strong>PKR {formatValue(charge.amount)}</strong></div>)}{selected.extraction?.taxes.map((tax, index) => <div className="detail-row" key={`${tax.type}-${index}`}><span>{tax.type.replace(/_/g, ' ')}</span><strong>PKR {formatValue(tax.amount)}</strong></div>)}<div className="detail-row total"><span>Payable by due date</span><strong>PKR {formatValue(selected.extraction?.payable_within_due_date)}</strong></div><div className="detail-row total late"><span>Payable after due date</span><strong>PKR {formatValue(selected.extraction?.payable_after_due_date)}</strong></div></div></div>}
                {activeTab === 'extraction' && <div className="json-card"><div className="json-toolbar"><span>Strict Level 1 schema</span><button onClick={() => navigator.clipboard?.writeText(JSON.stringify(selected.extraction, null, 2))}><FileJson size={14} /> Copy JSON</button></div><pre>{JSON.stringify(selected.extraction, null, 2)}</pre></div>}
                {activeTab === 'answers' && <div className="answers-list">{selected.answers.map((answer) => <div className="answer-card" key={answer.question_id}><div className="question-id">{answer.question_id}</div><div><strong>{answer.question}</strong><p>{answer.answer}</p></div></div>)}</div>}
              </>}
            </>}
          </section>
        </section>

        <section className="export-bar"><div className="export-copy"><div className="export-icon"><ArrowDownToLine size={18} /></div><div><strong>Your submission files are ready</strong><span>UTF-8 CSV · Exact challenge columns · {completedBills.length ? `${completedBills.length} bill${completedBills.length === 1 ? '' : 's'} decoded` : 'Waiting for decoded bills'}</span></div></div><div className="export-actions"><button className="outline-button" disabled={!completedBills.length} onClick={() => downloadCsv('level1.csv', level1Csv)}><FileJson size={16} /> level1.csv</button><button className="primary-button" disabled={!completedBills.length} onClick={() => downloadCsv('level2.csv', level2Csv)}><MessageSquareText size={16} /> level2.csv</button></div></section>
      </main>

      {isSettingsOpen && <div className="modal-backdrop" onClick={() => setIsSettingsOpen(false)}><div className="settings-modal" onClick={(event) => event.stopPropagation()}><div className="modal-head"><div><span className="section-kicker">WORKSPACE SETTINGS</span><h2>Connect your AI reader</h2></div><button className="close-button" onClick={() => setIsSettingsOpen(false)}><X size={18} /></button></div><p className="modal-intro">Your key is kept only in this browser session and is never included in exported files or stored with bill results.</p><label>Model provider<select value={modelProvider} onChange={(event) => { const value = event.target.value as ModelProvider; setModelProvider(value); setModelName(value === 'google' ? 'gemini-3.5-flash-lite' : value === 'openai' ? 'gpt-4.1-mini' : 'claude-haiku-4-5'); }}><option value="google">Google Gemini</option><option value="openai">OpenAI</option><option value="anthropic">Anthropic</option></select></label><label>Model name<input value={modelName} onChange={(event) => setModelName(event.target.value)} /></label><label><span className="label-with-icon"><KeyRound size={14} /> API key</span><input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="Paste your provider key" autoComplete="off" /></label><div className="supported-note"><HelpCircle size={16} /><span>Allowed challenge models include Gemini 3.5 Flash-Lite, Gemini 3.1 Flash-Lite, Claude Haiku 4.5, GPT-4.1 mini, and GPT-5 mini.</span></div><button className="primary-button full-width" onClick={() => { setIsSettingsOpen(false); setNotice(apiKey ? 'Model settings saved for this session.' : 'Add an API key before processing bills.'); }}><Check size={16} /> Save model settings</button></div></div>}
    </div>
  );
}

export default App;
