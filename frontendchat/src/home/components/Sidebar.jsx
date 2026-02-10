import React, { useEffect, useState } from 'react';
import { FaSearch } from 'react-icons/fa';
import { BiLogOut } from "react-icons/bi";
import axios from 'axios';
import useConversation from '../../Zustans/useConversation'; 
import { useSocketContext } from '../../context/SocketContext';
import { useAuth } from '../../context/AuthContext';
import { NavLink } from 'react-router';

const Sidebar = () => {
    const [allUsers, setAllUsers] = useState([]); 
    const [search, setSearch] = useState("");
    const [loading, setLoading] = useState(false);
    
    const { selectedConversation, setSelectedConversation } = useConversation();
    const { onlineUsers } = useSocketContext();
    const { setAuthUser } = useAuth();

    useEffect(() => {
        const token = setAuthUser?.token;
        const getUsers = async () => {
            setLoading(true);
            try {
                const res = await axios.get("https://vulnerable-abagail-personalllllll-3a6b55d5.koyeb.app/api/login/search", { 
                    params: { search: "" }, 
                    withCredentials: true ,
                headers: {
                Authorization: `Bearer ${token}`

            }

        });
                                console.log("Users received:", res.data);

                setAllUsers(res.data);
            } catch (error) {
                console.error("Error fetching users:", error);
            } finally {
                setLoading(false);
            }
        };
        getUsers();
    }, []);

    const filteredUsers = allUsers.filter(user => 
        user.username.toLowerCase().includes(search.toLowerCase())
    );

    const handleLogout = () => {
        localStorage.removeItem("chatapp");
        setAuthUser(null);
    };

    return (
        <div className='flex flex-col h-full w-full bg-slate-900 border-r border-slate-700 p-4'>
            <div className='flex items-center bg-slate-800 rounded-full px-4 py-2 mb-4 border border-transparent focus-within:border-sky-500'>
                <input 
                    type='text' 
                    placeholder='Search user...' 
                    className='bg-transparent outline-none text-white w-full text-sm'
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
                <FaSearch className='text-sky-500 cursor-pointer' />
            </div>
            <div className='flex-1 overflow-y-auto space-y-2 custom-scrollbar'>
                {loading ? (
                    <div className="flex justify-center mt-10">
                        <span className="loading loading-spinner text-sky-500"></span>
                    </div>
                ) : (
                    filteredUsers.map((user) => (
                        <div 
                            key={user._id} 
                            onClick={() => setSelectedConversation(user)}
                            className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all duration-200
                                ${selectedConversation?._id === user._id ? 'bg-sky-600 shadow-lg' : 'hover:bg-slate-800'}`}
                        >
                            <div className="relative">
                                <div className='w-12 h-12 rounded-full overflow-hidden border-2 border-slate-700'>
                                    <img 
                                        src={user.profilepic || "https://avatar.iran.liara.run/public"} 
                                        alt='user avatar' 
                                    />
                                </div>
                                {onlineUsers.includes(user._id) && (
                                    <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-slate-900 rounded-full"></span>
                                )}
                            </div>

                            <div className='flex flex-col flex-1'>
                                <p className='font-bold text-gray-200'>{user.username}</p>
                                <p className='text-xs text-gray-400'>Click to start chat</p>
                            </div>
                        </div>
                    ))
                )}
                
                {!loading && filteredUsers.length === 0 && (
                    <p className='text-center text-gray-500 mt-10 text-sm'>No users found</p>
                )}
            </div>

            <div className='mt-auto pt-4 border-t border-slate-700'>
                <button 
                    className='flex items-center gap-2 text-gray-400 hover:text-red-500 transition-colors w-full p-2'
                >
                    <BiLogOut size={22} />
                    <span  className='font-semibold'><NavLink to={"/"}>Home</NavLink></span>
                </button>
            </div>
        </div>
    );
};

export default Sidebar;

