import axios from 'axios';
import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
const Signin = () => {
  const [username, setUsername] = useState("");
  const [usernameError, setUsernameError] = useState("");
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [message, setMessage] = useState("");
  const navigate = useNavigate();
const [role, setRole] = useState("normal"); 




  const handleUsername = (e) => {
    const value = e.target.value;
    setUsername(value);

    if (value.length < 3) {
      setUsernameError("Username must be at least 3 characters");
    } else {
      setUsernameError("");
    }
  };

  const handleEmail = (e) => {
    const value = e.target.value;
    setEmail(value);

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setEmailError("Invalid Email");
    } else {
      setEmailError("");
    }
  };

  const handlePassword = (e) => {
    const value = e.target.value;
    setPassword(value);

    if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(value)) {
      setPasswordError("Password must have 8+ chars, uppercase, lowercase, and number");
    } else {
      setPasswordError("");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (usernameError || emailError || passwordError || !username || !email || !password) {
      setMessage("Please fix the errors before submitting");
      return;
    } else {
      setMessage("");
    }

    try {
      const response = await fetch("https://vulnerable-abagail-personalllllll-3a6b55d5.koyeb.app/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email, password ,role }),
      });

      const data = await response.json();

      if (!response.ok) {
        setMessage(data.message || "Signup failed");
      } else {
        setMessage("");
        navigate("/login"); 
      }
    } catch (error) {
      console.error(error);
      setMessage("Server error");
    }
  };




  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900">
      <div className="w-full max-w-sm bg-gray-800 p-6 rounded-xl shadow-lg">
        <h2 className="text-2xl font-bold text-white text-center mb-6">Sign Up</h2>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-gray-300 mb-1">Username</label>
            <input
              type="text"
              placeholder="Enter your username"
              className="w-full px-3 py-2 rounded-md bg-gray-700 text-white outline-none focus:ring-2 focus:ring-blue-500"
              value={username}
              onChange={handleUsername}
            />
            <span className="text-red-600">{usernameError}</span>
          </div>

          <div className="mb-4">
            <label className="block text-gray-300 mb-1">Email</label>
            <input
              type="text"
              placeholder="Enter your email"
              className="w-full px-3 py-2 rounded-md bg-gray-700 text-white outline-none focus:ring-2 focus:ring-blue-500"
              value={email}
              onChange={handleEmail}
            />
            <span className="text-red-600">{emailError}</span>
          </div>

          <div className="mb-4">
            <label className="block text-gray-300 mb-1">Password</label>
            <input
              type="password"
              placeholder="Enter your password"
              className="w-full px-3 py-2 rounded-md bg-gray-700 text-white outline-none focus:ring-2 focus:ring-blue-500"
              value={password}
              onChange={handlePassword}
            />
            <span className="text-red-600">{passwordError}</span>
          </div>
          <div className="mb-4">
            <label className="block text-white mb-1">User Type</label>
            <div className="flex gap-4">
              <label className="flex items-center text-white gap-2">
                <input
                  type="radio"
                  name="role"
                  value="normal"
                  checked={role === "normal"}
                  onChange={(e) => setRole(e.target.value)}
                />
                Normal
              </label>
              <label className="flex items-center text-white gap-2">
                <input
                  type="radio"
                  name="role"
                  value="blind"
                  checked={role === "blind"}
                  onChange={(e) => setRole(e.target.value)}
                />
                Blind
              </label>
            </div>
          </div>

          <button
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-md transition"
          >
            SignUp
          </button>

          {message && (
            <p className="mt-4 text-center text-red-500 font-semibold">{message}</p>
          )}
        </form>
<p className="mt-4 text-center text-gray-400">
                    I do have an account?{" "}
                    <a href="/login" className="text-sky-500 hover:underline">Log in</a>
                </p>      </div>
    </div>
  );
};

export default Signin;


