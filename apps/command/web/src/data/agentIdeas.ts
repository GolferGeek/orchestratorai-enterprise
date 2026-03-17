/**
 * Agent Ideas data — organized by industry.
 * Drives the WhatsPossible section and page.
 */

export type ProductType = 'Forge' | 'Compose' | 'Pulse' | 'Bridge';

export interface AgentIdea {
  name: string;
  description: string;
  product: ProductType;
  workflow: string;
}

export interface Industry {
  id: string;
  label: string;
  icon: string;
  ideas: AgentIdea[];
}

export const industries: Industry[] = [
  {
    id: 'legal',
    label: 'Legal',
    icon: '⚖️',
    ideas: [
      {
        name: 'Contract Analysis Agent',
        description: 'Multi-step contract review with automated risk flagging and clause extraction across entire agreement portfolios.',
        product: 'Forge',
        workflow: 'Upload contract → LangGraph extracts clauses → Risk scoring → Flag anomalies → Generate summary report',
      },
      {
        name: 'Legal Research Agent',
        description: 'RAG-powered case law research that surfaces relevant precedents and statutory references from your firm\'s knowledge base.',
        product: 'Compose',
        workflow: 'Submit query → Vector search across case law → Rank by relevance → Synthesize findings → Cite sources',
      },
      {
        name: 'Compliance Monitor',
        description: 'Watches for regulatory changes and automatically alerts stakeholders when new rules affect your practice areas.',
        product: 'Pulse',
        workflow: 'Regulatory feed trigger → Classify by practice area → Match to client portfolios → Draft alert → Notify team',
      },
      {
        name: 'Client Intake Agent',
        description: 'Automated client questionnaire that gathers case details, checks conflicts, and pre-qualifies matters before attorney review.',
        product: 'Compose',
        workflow: 'Client submits form → Extract key facts → Conflict check → Matter classification → Route to attorney',
      },
    ],
  },
  {
    id: 'marketing',
    label: 'Marketing',
    icon: '📢',
    ideas: [
      {
        name: 'Content Swarm',
        description: 'Multi-agent content pipeline that takes a brief through writer, editor, and evaluator agents before publishing.',
        product: 'Forge',
        workflow: 'Brief in → Writer agent drafts → Editor agent refines → Evaluator scores → Brand check → Publish-ready output',
      },
      {
        name: 'SEO Analyst',
        description: 'RAG-powered competitive analysis that benchmarks your content against top-ranking pages and surfaces gap opportunities.',
        product: 'Compose',
        workflow: 'Target keyword → Scrape SERPs → Index competitor content → Gap analysis → Keyword recommendations',
      },
      {
        name: 'Social Media Scheduler',
        description: 'Event-driven posting agent that publishes content based on optimal engagement windows and campaign triggers.',
        product: 'Pulse',
        workflow: 'Campaign event fires → Select content variant → Optimize timing → Post across channels → Log engagement',
      },
      {
        name: 'Campaign Performance Agent',
        description: 'API-powered analytics that pulls cross-channel data and generates plain-language performance narratives.',
        product: 'Compose',
        workflow: 'Pull ad platform APIs → Aggregate metrics → Detect anomalies → Generate narrative → Recommend next actions',
      },
    ],
  },
  {
    id: 'engineering',
    label: 'Engineering',
    icon: '⚙️',
    ideas: [
      {
        name: 'CAD Assistant',
        description: 'Engineering design review with LangGraph that analyzes specifications, checks tolerances, and flags design conflicts.',
        product: 'Forge',
        workflow: 'Upload specs → Parse dimensions → Tolerance check → Material compatibility → Conflict detection → Review report',
      },
      {
        name: 'Code Review Agent',
        description: 'Context-aware code analysis that understands your codebase conventions and surfaces security, performance, and style issues.',
        product: 'Compose',
        workflow: 'PR submitted → Index repo context → Analyze diff → Security scan → Convention check → Inline comment generation',
      },
      {
        name: 'Incident Response',
        description: 'Automated triage on alert triggers that classifies severity, assembles runbooks, and notifies the right on-call team.',
        product: 'Pulse',
        workflow: 'Alert fires → Classify severity → Pull relevant runbook → Notify on-call → Log timeline → Draft postmortem',
      },
      {
        name: 'Documentation Generator',
        description: 'RAG-powered doc generation that reads your codebase and produces accurate, up-to-date reference documentation.',
        product: 'Compose',
        workflow: 'Scan codebase → Extract function signatures → Match to existing docs → Generate updates → Publish to docs site',
      },
    ],
  },
  {
    id: 'healthcare',
    label: 'Healthcare',
    icon: '🏥',
    ideas: [
      {
        name: 'Patient Triage Agent',
        description: 'Multi-step assessment workflow that collects symptoms, cross-references clinical guidelines, and routes patients appropriately.',
        product: 'Forge',
        workflow: 'Symptom intake → Clinical guideline lookup → Risk stratification → Route to care level → Notify provider',
      },
      {
        name: 'Medical Research',
        description: 'RAG-powered literature review across PubMed and clinical databases to surface evidence for treatment decisions.',
        product: 'Compose',
        workflow: 'Clinical question → Search literature index → Rank by evidence level → Synthesize findings → Format citation',
      },
      {
        name: 'Appointment Scheduler',
        description: 'API-powered scheduling that matches patient needs with provider availability and sends automated reminders.',
        product: 'Compose',
        workflow: 'Patient request → Check availability API → Match preferences → Confirm booking → Send reminders → Handle cancellations',
      },
      {
        name: 'Compliance Auditor',
        description: 'Watches for HIPAA violations and policy drift, automatically flagging access anomalies and documentation gaps.',
        product: 'Pulse',
        workflow: 'Access log event → Policy rule check → Anomaly scoring → Flag violations → Alert compliance officer → Log for audit',
      },
    ],
  },
  {
    id: 'finance',
    label: 'Finance',
    icon: '💹',
    ideas: [
      {
        name: 'Risk Analysis',
        description: 'Monte Carlo simulation dashboard that models portfolio risk scenarios and visualizes confidence intervals in real time.',
        product: 'Forge',
        workflow: 'Portfolio input → Run Monte Carlo sims → Aggregate scenarios → Compute VaR → Generate interactive dashboard',
      },
      {
        name: 'Market Predictor',
        description: 'Multi-stage prediction pipeline that ingests market signals, applies ML models, and surfaces high-conviction trade ideas.',
        product: 'Forge',
        workflow: 'Ingest market feeds → Feature engineering → Model inference → Confidence scoring → Signal generation → Alert trader',
      },
      {
        name: 'Fraud Detection',
        description: 'Real-time transaction monitoring that flags suspicious patterns and initiates automated review workflows.',
        product: 'Pulse',
        workflow: 'Transaction event → Feature extraction → Anomaly model score → Risk threshold check → Flag for review → Log decision',
      },
      {
        name: 'Portfolio Advisor',
        description: 'RAG-powered investment research that answers advisor questions using proprietary research, filings, and market data.',
        product: 'Compose',
        workflow: 'Advisor query → Search research index → Cross-reference filings → Synthesize answer → Cite sources → Compliance check',
      },
    ],
  },
  {
    id: 'hr',
    label: 'HR',
    icon: '👥',
    ideas: [
      {
        name: 'Resume Screener',
        description: 'RAG-powered candidate matching that scores resumes against job requirements and surfaces the strongest candidates.',
        product: 'Compose',
        workflow: 'Resume upload → Extract skills and experience → Match against JD requirements → Score and rank → Generate summary',
      },
      {
        name: 'Onboarding Assistant',
        description: 'Guided new hire workflow that delivers personalized onboarding tasks, answers policy questions, and tracks completion.',
        product: 'Compose',
        workflow: 'Employee starts → Personalize task list → Deliver content in sequence → Answer questions via RAG → Track milestones',
      },
      {
        name: 'Policy Advisor',
        description: 'RAG-powered HR policy Q&A that gives employees accurate, cited answers drawn from your employee handbook.',
        product: 'Compose',
        workflow: 'Employee question → Search policy index → Retrieve relevant sections → Generate cited answer → Log for HR review',
      },
      {
        name: 'Exit Interview Analyst',
        description: 'Sentiment analysis pipeline that processes exit interview transcripts and surfaces retention risk patterns.',
        product: 'Forge',
        workflow: 'Transcript upload → Sentiment analysis → Theme extraction → Trend detection → Anonymize → Generate insights report',
      },
    ],
  },
];

export const productColors: Record<ProductType, string> = {
  Forge: '#f59e0b',
  Compose: '#3b82f6',
  Pulse: '#22c55e',
  Bridge: '#8b5cf6',
};
