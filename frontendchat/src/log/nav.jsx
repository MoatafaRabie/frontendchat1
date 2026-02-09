import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext"; 
import axios from "axios";
import { toast } from "react-toastify";

const Nav = () => {
  const { authUser, setAuthUser } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await axios.post("https://vulnerable-abagail-personalllllll-3a6b55d5.koyeb.app/api/logout", {}, {
        withCredentials: true
      });
      localStorage.removeItem("chatapp");
      setAuthUser(null);
      toast.success("Logged out successfully");
      navigate("/login");
    } catch (error) {
      console.error("Logout error:", error);
      toast.error("Failed to logout");
    }
  };

  return (
  
  
 
    <div className="min-h-screen relative overflow-hidden bg-black">
      <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-gray-900 to-black" />
      <div className="absolute top-20 left-20 w-72 h-72 bg-yellow-400/20 rounded-full blur-3xl" />
      <div className="absolute bottom-20 right-20 w-72 h-72 bg-blue-500/20 rounded-full blur-3xl" />
      
      <div className="relative z-10 flex justify-end space-x-4 p-6">
        {!authUser ? (
          <>
            <NavLink to="/login" className="bg-black text-white rounded-md p-2 px-5 border border-gray-700 hover:bg-slate-800 transition">
              Login
            </NavLink>
            <NavLink to="/signin" className="bg-black text-white rounded-md p-2 px-5 border border-gray-700 hover:bg-slate-800 transition">
              Sign up
            </NavLink>
          </>
        ) : (
          <div className="flex items-center gap-4">
            
            <NavLink 
              to="/chat" 
              className="flex items-center  gap-2 bg-blue-600 text-white rounded-full p-2 px-4 hover:bg-blue-500 transition"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
              </svg>
              <span>Chat</span>
            </NavLink>
            <span className="text-gray-300 text-sm hidden sm:inline">| Welcome, {authUser.username}</span>
            <button
              className="bg-red-600 text-white rounded-md p-2 px-5 hover:bg-red-500 transition font-bold text-sm"
              onClick={handleLogout}
            >
              Log out
            </button>
          </div>
        )}
        
      </div>

      <main className="relative z-10 flex items-center justify-center min-h-screen text-center px-4">
        <div className="max-w-2xl text-white">
          <h1 className="text-5xl font-extrabold mb-6 animate-pulse">
            Blind Chat System
          </h1>
          <p className="text-lg text-gray-300 leading-relaxed">
            This website provides a simple and accessible way for blind people
            to communicate with others using only smart glasses.
          </p>
          
        </div>
      </main>
            
    </div>
    
             
  );
};

export default Nav;