import jwt from 'jsonwebtoken';

const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2OTBlNTc1YjVkNTQyYjU3ZjY4MmYzYmYiLCJpYXQiOjE3NjI3MTkxOTgsImV4cCI6MTc2NTMxMTE5OH0.PLuU54gG-Wg1VF_v1zNpBE5KyP36FAa3jloEpwJ1tJA';

try {
  console.log('Token analysis:');
  console.log('Full token:', token);
  
  // Decode without verification to see what's inside
  const decoded = jwt.decode(token);
  console.log('\nDecoded payload:');
  console.log(decoded);
  
  console.log('\nuserId from token:');
  console.log('Value:', decoded.userId);
  console.log('Type:', typeof decoded.userId);
  console.log('Length:', decoded.userId.length);
  
  // This should be treated as a string from JWT perspective
  console.log('\nWhen compared:');
  console.log('decoded.userId === "690e575b5d542b57f682f3bf"?', decoded.userId === '690e575b5d542b57f682f3bf');
  
} catch (error) {
  console.error('Error:', error.message);
}
