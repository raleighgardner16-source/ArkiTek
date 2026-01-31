# API Key Storage Implementation Plan

## Current Implementation (MVP)
- **Storage**: Browser localStorage (client-side only)
- **Pros**: Simple, no backend needed, works immediately
- **Cons**: Not secure for production, lost if user clears browser data, not synced across devices

## Recommended Production Implementation

### Option 1: Encrypted Database Storage (Recommended)
**Architecture:**
- Backend API server (Node.js/Express, Python/Flask, etc.)
- Database (PostgreSQL, MongoDB, etc.)
- Encryption at rest and in transit

**Security Features:**
1. **Encryption**: API keys encrypted using AES-256 before storing in database
2. **User Authentication**: Users must sign up/login to store keys
3. **HTTPS Only**: All API calls over HTTPS
4. **Key Management**: Keys only decrypted when needed for API calls
5. **Access Control**: Users can only access their own keys

**Implementation Steps:**
1. Create backend API with endpoints:
   - `POST /api/users/register` - User registration
   - `POST /api/users/login` - User authentication
   - `POST /api/keys` - Store encrypted API key
   - `GET /api/keys` - Retrieve user's API keys (decrypted on-demand)
   - `DELETE /api/keys/:provider` - Delete API key
   - `POST /api/llm/call` - Proxy LLM calls (keys never exposed to frontend)

2. Database Schema:
   ```sql
   users (
     id, email, password_hash, created_at
   )
   
   api_keys (
     id, user_id, provider, encrypted_key, created_at, updated_at
   )
   ```

3. Frontend Changes:
   - Replace localStorage with API calls
   - Add authentication UI
   - Store JWT token for session management

### Option 2: Hybrid Approach
- Store keys in database (encrypted)
- Cache decrypted keys in localStorage for performance
- Sync on login/logout
- Clear cache on browser close

### Option 3: Third-Party Key Management
- Use services like AWS Secrets Manager, HashiCorp Vault
- More secure but adds complexity and cost

## Security Best Practices
1. **Never log API keys** in console or server logs
2. **Use environment variables** for encryption keys
3. **Implement rate limiting** on API endpoints
4. **Add audit logging** for key access
5. **Regular security audits** and penetration testing

## Migration Path
1. Keep localStorage for MVP
2. Build backend API
3. Add user authentication
4. Migrate existing keys to database (with user consent)
5. Phase out localStorage

## Next Steps
Would you like me to:
1. Set up a backend API for key storage?
2. Implement user authentication?
3. Create the database schema?
4. Build the encryption/decryption service?

