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

export const FASTAPI_WITH_MONGODB = `
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from pymongo import MongoClient
from bson import ObjectId
import uvicorn
import os
from datetime import datetime
from typing import List, Dict, Any

# Pydantic models for request/response
class UserCreate(BaseModel):
    name: str
    email: str

app = FastAPI(title="FastAPI with MongoDB", version="1.0.0")

# Allow all origins for simplicity in this test
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Database connection parameters (pre-configured in E2B template)
DATABASE_URL = "mongodb://127.0.0.1:27017/myapp"

def get_database():
    """Get database connection"""
    try:
        client = MongoClient(DATABASE_URL, serverSelectionTimeoutMS=5000)
        # Test the connection
        client.admin.command('ping')
        db = client.myapp
        return db
    except Exception as e:
        print(f"Database connection error: {e}")
        raise HTTPException(status_code=500, detail=f"Database connection failed: {str(e)}")

@app.on_event("startup")
async def startup_event():
    """Initialize database collections on startup"""
    try:
        db = get_database()
        
        # Create indexes for better performance
        db.users.create_index("email", unique=True)
        
        print("Database initialized successfully")
    except Exception as e:
        print(f"Database initialization error: {e}")

@app.get("/")
def read_root():
    return {"status": "Backend with MongoDB is running", "message": "FastAPI + MongoDB backend is operational"}

@app.get("/api/hello")
def read_hello():
    return {"message": "Hello from FastAPI Backend with MongoDB!", "status": "success"}

@app.get("/health")
def health_check():
    return {"status": "healthy", "service": "fastapi-mongodb-backend"}

@app.get("/api/users")
async def get_users():
    """Get all users from database"""
    try:
        db = get_database()
        users = list(db.users.find({}, {"_id": 1, "name": 1, "email": 1, "created": 1}))
        
        # Convert ObjectId to string for JSON serialization
        for user in users:
            user["_id"] = str(user["_id"])
            if "created" in user and user["created"]:
                user["created"] = user["created"].isoformat()
        
        return {
            "users": users,
            "count": len(users)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch users: {str(e)}")

@app.post("/api/users")
async def create_user(user_data: UserCreate):
    """Create a new user"""
    print(f"Received user creation request: name={user_data.name}, email={user_data.email}")
    
    try:
        db = get_database()
        print("Database connection successful")
        
        # Check if email already exists
        existing_user = db.users.find_one({"email": user_data.email})
        if existing_user:
            print(f"Email {user_data.email} already exists")
            raise HTTPException(status_code=400, detail="Email already exists")
        
        user_doc = {
            "name": user_data.name,
            "email": user_data.email,
            "created": datetime.utcnow()
        }
        
        print(f"Inserting user document: {user_doc}")
        result = db.users.insert_one(user_doc)
        user_id = str(result.inserted_id)
        print(f"User created successfully with ID: {user_id}")
        
        return {
            "message": "User created successfully",
            "user_id": user_id,
            "status": "success"
        }
    except HTTPException:
        # Re-raise HTTP exceptions (like duplicate email)
        raise
    except Exception as e:
        print(f"Database error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to create user: {str(e)}")

@app.get("/api/db-status")
async def database_status():
    """Check database connection status"""
    try:
        db = get_database()
        # Try to get server info
        server_info = db.client.server_info()
        
        return {
            "status": "connected",
            "database": "MongoDB",
            "version": server_info.get("version", "Unknown"),
            "connection_url": "mongodb://127.0.0.1:27017/myapp"
        }
    except Exception as e:
        return {
            "status": "disconnected",
            "error": str(e)
        }

@app.get("/api/collections")
async def get_collections():
    """Get list of collections in the database"""
    try:
        db = get_database()
        collections = db.list_collection_names()
        return {
            "collections": collections,
            "count": len(collections)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch collections: {str(e)}")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
`;

export const NEXTJS_WITH_MONGODB_PAGE = `
'use client'
import { useState, useEffect } from 'react'

export default function Home() {
  const [message, setMessage] = useState('Loading...')
  const [error, setError] = useState('')
  const [apiUrl, setApiUrl] = useState('')
  const [users, setUsers] = useState([])
  const [dbStatus, setDbStatus] = useState(null)
  const [collections, setCollections] = useState([])
  const [newUserName, setNewUserName] = useState('')
  const [newUserEmail, setNewUserEmail] = useState('')

  useEffect(() => {
    const backendUrl = process.env.NEXT_PUBLIC_API_URL
    setApiUrl(backendUrl || 'No API URL configured')
    
    if (!backendUrl) {
      setMessage('No backend URL configured')
      setError('NEXT_PUBLIC_API_URL environment variable not set')
      return
    }

    console.log('Attempting to fetch from:', backendUrl + '/api/hello')
    
    // Test basic connection
    fetch(backendUrl + '/api/hello')
      .then(res => {
        if (!res.ok) {
          throw new Error(\`HTTP \${res.status}: \${res.statusText}\`)
        }
        return res.json()
      })
      .then(data => {
        setMessage(data.message || 'Backend responded but no message')
        setError('')
        
        // Check database status
        return fetch(backendUrl + '/api/db-status')
      })
      .then(res => {
        if (!res.ok) {
          throw new Error(\`HTTP \${res.status}: \${res.statusText}\`)
        }
        return res.json()
      })
      .then(data => {
        setDbStatus(data)
        
        // Fetch users if database is connected
        if (data.status === 'connected') {
          return Promise.all([
            fetch(backendUrl + '/api/users').then(res => {
              if (!res.ok) throw new Error(\`Users API error: \${res.status}\`)
              return res.json()
            }),
            fetch(backendUrl + '/api/collections').then(res => {
              if (!res.ok) throw new Error(\`Collections API error: \${res.status}\`)
              return res.json()
            })
          ])
        }
      })
      .then(responses => {
        if (responses) {
          setUsers(responses[0].users || [])
          setCollections(responses[1].collections || [])
        }
      })
      .catch(err => {
        console.error('Failed to fetch from API:', err)
        setMessage('Failed to connect to backend.')
        setError(err.message || 'Unknown error')
      })
  }, [])

  const createUser = async () => {
    if (!newUserName || !newUserEmail) return
    
    try {
      const response = await fetch(apiUrl + '/api/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: newUserName,
          email: newUserEmail
        })
      })
      
      if (response.ok) {
        setNewUserName('')
        setNewUserEmail('')
        // Refresh users list
        const usersResponse = await fetch(apiUrl + '/api/users')
        if (usersResponse.ok) {
          const usersData = await usersResponse.json()
          setUsers(usersData.users || [])
        }
      } else {
        const errorText = await response.text()
        let errorMessage = 'Failed to create user'
        try {
          const errorData = JSON.parse(errorText)
          errorMessage = errorData.detail || errorMessage
        } catch {
          errorMessage = \`HTTP \${response.status}: \${response.statusText}\`
        }
        alert(errorMessage)
      }
    } catch (err) {
      alert('Error creating user: ' + err.message)
    }
  }

  return (
    <main style={{ fontFamily: 'sans-serif', padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
      <h1>Next.js Frontend with MongoDB</h1>
      
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

      {dbStatus && (
        <div style={{ marginBottom: '20px' }}>
          <h2>Database Status</h2>
          <div style={{ 
            backgroundColor: dbStatus.status === 'connected' ? '#e8f5e8' : '#ffebee', 
            padding: '10px', 
            borderRadius: '4px' 
          }}>
            <p><strong>Status:</strong> {dbStatus.status}</p>
            {dbStatus.database && <p><strong>Database:</strong> {dbStatus.database}</p>}
            {dbStatus.version && <p><strong>Version:</strong> {dbStatus.version}</p>}
            {dbStatus.error && <p><strong>Error:</strong> {dbStatus.error}</p>}
          </div>
        </div>
      )}

      {collections.length > 0 && (
        <div style={{ marginBottom: '20px' }}>
          <h2>MongoDB Collections</h2>
          <div style={{ backgroundColor: '#f5f5f5', padding: '10px', borderRadius: '4px' }}>
            {collections.map((collection, index) => (
              <span key={index} style={{ 
                display: 'inline-block', 
                margin: '2px 5px', 
                padding: '2px 8px', 
                backgroundColor: '#007bff', 
                color: 'white', 
                borderRadius: '12px', 
                fontSize: '12px' 
              }}>
                {collection}
              </span>
            ))}
          </div>
        </div>
      )}

      {users.length > 0 && (
        <div style={{ marginBottom: '20px' }}>
          <h2>Users from MongoDB</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#f5f5f5' }}>
                <th style={{ border: '1px solid #ddd', padding: '8px' }}>ID</th>
                <th style={{ border: '1px solid #ddd', padding: '8px' }}>Name</th>
                <th style={{ border: '1px solid #ddd', padding: '8px' }}>Email</th>
                <th style={{ border: '1px solid #ddd', padding: '8px' }}>Created</th>
              </tr>
            </thead>
            <tbody>
              {users.map(user => (
                <tr key={user._id}>
                  <td style={{ border: '1px solid #ddd', padding: '8px', fontSize: '10px' }}>{user._id}</td>
                  <td style={{ border: '1px solid #ddd', padding: '8px' }}>{user.name}</td>
                  <td style={{ border: '1px solid #ddd', padding: '8px' }}>{user.email}</td>
                  <td style={{ border: '1px solid #ddd', padding: '8px' }}>
                    {user.created ? new Date(user.created).toLocaleDateString() : 'N/A'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ marginBottom: '20px' }}>
        <h2>Add New User</h2>
        <div style={{ marginBottom: '10px' }}>
          <input
            type="text"
            placeholder="Name"
            value={newUserName}
            onChange={(e) => setNewUserName(e.target.value)}
            style={{ padding: '8px', marginRight: '10px', border: '1px solid #ddd', borderRadius: '4px' }}
          />
          <input
            type="email"
            placeholder="Email"
            value={newUserEmail}
            onChange={(e) => setNewUserEmail(e.target.value)}
            style={{ padding: '8px', marginRight: '10px', border: '1px solid #ddd', borderRadius: '4px' }}
          />
          <button
            onClick={createUser}
            style={{
              padding: '8px 16px',
              backgroundColor: '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Add User
          </button>
        </div>
      </div>
      
      <div style={{ marginTop: '30px' }}>
        <h3>Test Information</h3>
        <ul>
          <li>Frontend runs on port 3000</li>
          <li>Backend runs on port 8000</li>
          <li>MongoDB runs on port 27017</li>
          <li>Database: myapp (no authentication)</li>
          <li>CORS is enabled on backend</li>
        </ul>
      </div>
    </main>
  )
}
`;

export const MONGODB_REQUIREMENTS_TXT = `
fastapi==0.104.1
uvicorn[standard]==0.24.0
pymongo==4.6.0
`;
