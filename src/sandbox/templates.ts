export const FASTAPI_HELLO_WORLD = `
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

app = FastAPI(title="Test Backend", version="1.0.0")

# Allow all origins for simplicity in this test
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"status": "Backend is running", "message": "FastAPI backend is operational"}

@app.get("/api/hello")
def read_hello():
    return {"message": "Hello from FastAPI Backend!", "status": "success"}

@app.get("/health")
def health_check():
    return {"status": "healthy", "service": "fastapi-backend"}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
`;

export const NEXTJS_HELLO_WORLD_PAGE = `
'use client'
import { useState, useEffect } from 'react'

export default function Home() {
  const [message, setMessage] = useState('Loading...')
  const [error, setError] = useState('')
  const [apiUrl, setApiUrl] = useState('')

  useEffect(() => {
    const backendUrl = process.env.NEXT_PUBLIC_API_URL
    setApiUrl(backendUrl || 'No API URL configured')
    
    if (!backendUrl) {
      setMessage('No backend URL configured')
      setError('NEXT_PUBLIC_API_URL environment variable not set')
      return
    }

    console.log('Attempting to fetch from:', backendUrl + '/api/hello')
    
    // Try to fetch from the backend
    fetch(backendUrl + '/api/hello', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })
      .then(res => {
        console.log('Response status:', res.status)
        if (!res.ok) {
          throw new Error(\`HTTP \${res.status}: \${res.statusText}\`)
        }
        return res.json()
      })
      .then(data => {
        console.log('Response data:', data)
        setMessage(data.message || 'Backend responded but no message')
        setError('')
      })
      .catch(err => {
        console.error('Failed to fetch from API:', err)
        setMessage('Failed to connect to backend.')
        setError(err.message || 'Unknown error')
      })
  }, [])

  return (
    <main style={{ fontFamily: 'sans-serif', padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
      <h1>Next.js Frontend</h1>
      <div style={{ marginBottom: '20px' }}>
        <h2>Backend Connection Status</h2>
        <p><strong>API URL:</strong> {apiUrl}</p>
        <p><strong>Message from backend:</strong> <span style={{ color: error ? 'red' : 'green' }}>{message}</span></p>
        {error && (
          <div style={{ backgroundColor: '#ffebee', padding: '10px', borderRadius: '4px', marginTop: '10px' }}>
            <strong>Error Details:</strong> {error}
          </div>
        )}
      </div>
      
      <div style={{ marginTop: '30px' }}>
        <h3>Test Information</h3>
        <ul>
          <li>Frontend runs on port 3000</li>
          <li>Backend should run on port 8000</li>
          <li>CORS is enabled on backend</li>
          <li>Check browser console for detailed logs</li>
        </ul>
      </div>
    </main>
  )
}
`;