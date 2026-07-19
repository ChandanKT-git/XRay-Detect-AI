# X-Ray Detection - AI Medical Imaging Analysis

An AI-powered web application designed for analyzing medical images (X-rays, CT scans, MRI) to detect diseases such as pneumonia, tumors, fractures, and other abnormalities. Built with a focus on clinical workflows, this application provides healthcare professionals with an end-to-end platform for secure image upload, AI-assisted diagnosis, and legal reporting.

**Live Demo**: [https://x-ray-detect-ai.vercel.app/](https://x-ray-detect-ai.vercel.app/)
## Key Technical Highlights

- **Multi-Modal AI Integration**: Integrated Google Gemini 2.5 Flash and Groq Llama 4 Vision models to process complex medical imagery and return structured JSON bounding boxes and diagnostic confidence scores.
- **Asynchronous Architecture**: Built a high-performance backend using FastAPI and Motor (async MongoDB driver) to handle concurrent large image uploads and non-blocking AI model inference.
- **Secure Clinical Workflow**: Implemented role-based access control (RBAC), JWT authentication, and comprehensive audit trails to simulate HIPAA-compliant data handling practices.
- **Dynamic PDF Generation**: Engineered an automated reporting system using jsPDF to generate professional medical reports complete with clinician signatures and annotated bounding boxes on the client side.
- **Modern Responsive UI**: Developed a component-driven frontend using React 19, Tailwind CSS, and shadcn/ui to deliver a seamless, hospital-grade user experience across desktop and tablet devices.

## Tech Stack

### Frontend
- React 19
- Tailwind CSS & shadcn/ui
- Framer Motion
- React Router
- Axios & jsPDF

### Backend
- FastAPI (Python 3.9+)
- Motor (Async MongoDB)
- PyJWT & bcrypt
- Pydantic

### AI & Infrastructure
- Google Gemini & Groq Vision Models
- MongoDB Atlas (NoSQL)
- Resend API (Email Notifications)
- Docker (Optional Containerization)

## Core Features

- **Authentication & User Management**: Secure JWT login, Role-based access (Admin/Doctor), and user profile management.
- **AI-Powered Analysis**: Automatic disease detection with bounding box visualization of abnormal regions.
- **Clinical Workflow**: Upload and analyze JPG/PNG/WEBP images (up to 10MB), review AI findings, and sign-off with legal attestation.
- **Patient Management**: Aggregate patient records, view timeline histories, and compare multiple scans.
- **Admin Dashboard**: System-wide statistics, user role assignment, and comprehensive scan oversight.

## System Architecture

The application follows a decoupled client-server architecture:
1. **Client (React)**: Handles image processing, UI state, and rendering of AI bounding boxes.
2. **API Gateway (FastAPI)**: Manages authentication, routes requests, and validates data payloads via Pydantic.
3. **AI Services**: Asynchronously communicates with external LLM Vision APIs to process images and return structured findings.
4. **Database (MongoDB)**: Stores user credentials, patient data, and immutable scan audit logs.

## Quick Start & Installation

### Prerequisites
- Python 3.9+
- Node.js 16+ and Yarn
- MongoDB (Atlas account recommended)
- Gemini API key

### Local Setup

1. **Clone the repository**
```bash
git clone <repository-url>
cd XRay-Detection-main
```

2. **Setup Backend**
```bash
cd backend
pip install -r requirements.txt
cp .env.example .env
# Configure MONGO_URL and GEMINI_API_KEY in .env
python server.py
```

3. **Setup Frontend**
```bash
cd ../frontend
yarn install
cp .env.example .env
# Configure REACT_APP_BACKEND_URL in .env
yarn start
```

The frontend will be available at `http://localhost:3000` and the backend API at `http://localhost:8000`.

## Testing

API tests are included and can be run using the standard Python test runner:
```bash
cd backend/tests
python test_medai_api.py
```

## Disclaimer

This application is for educational and research purposes. It is NOT approved for clinical use or medical diagnosis. All AI outputs must be reviewed by licensed medical professionals before any clinical decisions are made.
