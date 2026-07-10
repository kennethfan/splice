// Splice Test File — contains simulated Git conflict markers
// Open this file in Splice to test the resolution flow

function greet(name) {
<<<<<<< HEAD
  return "Hello, " + name + "!";
=======
  return `Hi there, ${name}!`;
>>>>>>> feature/greeting
}

function calculateTotal(items) {
<<<<<<< HEAD
  return items.reduce((sum, item) => sum + item.price, 0);
=======
  let total = 0;
  for (const item of items) {
    total += item.price;
  }
  return total;
>>>>>>> feature/refactor
}

const CONFIG = {
<<<<<<< HEAD
  apiUrl: "https://api.example.com/v1",
  timeout: 5000,
  retries: 3,
=======
  apiUrl: "https://api.example.com/v2",
  timeout: 10000,
  maxRetries: 5,
>>>>>>> feature/api-update
};

function formatDate(date) {
  const options = { year: "numeric", month: "long", day: "numeric" };
  return date.toLocaleDateString("en-US", options);
}

function validateEmail(email) {
<<<<<<< HEAD
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
||||||| parent of abc1234
  // TODO: implement email validation
  return true;
=======
  if (!email || !email.includes("@")) return false;
  const [local, domain] = email.split("@");
  return local.length > 0 && domain.includes(".");
>>>>>>> feature/validation
}

// No conflict here
function logMessage(level, message) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`);
}
