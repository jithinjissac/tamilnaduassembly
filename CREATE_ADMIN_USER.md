# Quick Admin User Setup

## Method 1: Update Existing User to Admin

Run this in MongoDB Compass or mongosh:

```javascript
// Replace with your registered email
db.users.updateOne(
  { email: "your-email@example.com" },
  { 
    $set: { 
      role: "admin",
      pricePerVoter: 0.50,
      isActive: true
    } 
  }
)
```

## Method 2: Create New Admin User

### Step 1: Generate Password Hash

Run this in Node.js terminal (from project directory):

```bash
node -e "const bcrypt = require('bcryptjs'); bcrypt.hash('admin123', 10).then(hash => console.log(hash));"
```

Copy the hash output (starts with `$2a$10$...`)

### Step 2: Insert Admin User

In MongoDB:

```javascript
db.users.insertOne({
  name: "Admin User",
  email: "admin@test.com",
  password: "$2a$10$PASTE_YOUR_HASH_HERE",  // Replace with hash from Step 1
  phone: "9876543210",
  role: "admin",
  pricePerVoter: 0.50,
  isActive: true,
  createdAt: new Date()
})
```

## Login Credentials

After creating admin user:
- **URL:** http://localhost:3000/login.html
- **Email:** admin@test.com
- **Password:** admin123

## Access Admin Dashboard

After login: http://localhost:3000/admin.html

## Verify Admin Role

Check in MongoDB:

```javascript
db.users.findOne({ email: "admin@test.com" }, { name: 1, email: 1, role: 1, pricePerVoter: 1 })
```

Expected output:
```json
{
  "_id": ObjectId("..."),
  "name": "Admin User",
  "email": "admin@test.com",
  "role": "admin",
  "pricePerVoter": 0.5
}
```
