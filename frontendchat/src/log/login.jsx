import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../context/AuthContext'; 
import axios from 'axios';
import { toast } from 'react-toastify';

const Login = () => {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [emailError, setEmailError] = useState("");
    const [passwordError, setPasswordError] = useState("");
    const [loading, setLoading] = useState(false);
    const [submit, setsubmit] = useState("");


    const navigate = useNavigate();
    const { setAuthUser } = useAuth();

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

        if (emailError || passwordError || !email || !password) {
            toast.error("Please fix the errors before submitting");
            return;
        }

        setLoading(true);
        try {
            const res = await axios.post("https://backendforchat.vercel.app/api/login", 
                { email, password }, 
                {
                    withCredentials: true,
                    headers: { "Content-Type": "application/json" }
                }
            );

            const data = res.data;

            localStorage.setItem("chatapp", JSON.stringify(data));
            setAuthUser(data);

            toast.success("Welcome back!");
            navigate("/"); 

        } catch (error) {
            const errMsg = error.response?.data?.message || "Email or Password is incorrect";
            toast.error(errMsg);
            setsubmit("Invalid Password or Email");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex items-center justify-center min-h-screen bg-gray-900">
            <div className="w-full max-w-md p-8 bg-gray-800 rounded-2xl shadow-xl border border-gray-700">
                <h1 className="text-3xl font-bold text-center text-white mb-6">
                    Login 
                </h1>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-gray-400 mb-2">Email</label>
                        <input
                            type="email"
                            className={`w-full px-4 py-2 rounded-lg bg-gray-700 text-white outline-none border transition ${emailError ? 'border-red-600 focus:ring-red-500' : 'border-gray-600 focus:ring-sky-500'}`}
                            placeholder="Enter your email"
                            value={email}
                            onChange={handleEmail}
                        />
                        {emailError && <span className='text-red-500 text-xs mt-1'>{emailError}</span>}
                    </div>

                    <div>
                        <label className="block text-gray-400 mb-2">Password</label>
                        <input
                            type="password"
                            className={`w-full px-4 py-2 rounded-lg bg-gray-700 text-white outline-none border transition ${passwordError ? 'border-red-600 focus:ring-red-500' : 'border-gray-600 focus:ring-sky-500'}`}
                            placeholder="••••••••"
                            value={password}
                            onChange={handlePassword}
                        />
                        {passwordError && <span className='text-red-500 text-xs mt-1'>{passwordError}</span>}
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-2 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-lg transition duration-200 disabled:bg-gray-600"
                    >
                        {loading ? "Logging in..." : "Login"}
                    </button>
                     <span className='text-red-600 text-sm m-20'>{submit}</span>
                </form>

                <p className="mt-4 text-center text-gray-400">
                    Don't have an account?{" "}
                    <a href="/signin" className="text-sky-500 hover:underline">Sign Up</a>
                </p>
            </div>
        </div>
    );
};

export default Login;




