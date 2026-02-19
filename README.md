# Tuft Studio

A web-based application that converts images into tuft-ready rug patterns.

## Architecture

```
tuft-studio/
├── frontend/          # Next.js (App Router) + TypeScript + Tailwind
│   └── src/
│       ├── app/       # Pages & routes
│       ├── components/# UI components
│       ├── lib/       # API client, utilities
│       ├── stores/    # Zustand state management
│       └── types/     # Shared TypeScript types
│
├── backend/           # Python FastAPI + OpenCV
│   └── app/
│       ├── api/       # Route handlers
│       ├── processing/# Image pipeline modules
│       └── models/    # Pydantic schemas
```

## Deployment

- **Frontend**: Vercel (Next.js)
- **Backend**: Railway or Fly.io (FastAPI + OpenCV)

## Getting Started

### Frontend
```bash
cd frontend
npm install
npm run dev
```

### Backend
```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload
```

## Development Phases

- [x] Phase 1: Upload → Quantization → Preview
- [ ] Phase 2: Thickness enforcement → Outline extraction
- [ ] Phase 3: Projection Mode
- [ ] Phase 4: PDF export + Yarn estimation
