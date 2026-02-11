import { createContext, useState, useEffect, useContext } from "react";
import io from "socket.io-client";
import { useAuth } from "./AuthContext";

const SocketContext = createContext();

export const useSocketContext = () => useContext(SocketContext);

export const SocketContextProvider = ({ children }) => {
    const [socket, setSocket] = useState(null);
    const [onlineUsers, setOnlineUsers] = useState([]); 
    const { authUser } = useAuth();

    useEffect(() => {
        if (authUser) {
            const newSocket = io("https://backendforchat.vercel.app", {
                query: { userId: authUser._id },
                transports: ["polling", "websocket"],
                withCredentials: true,
            });

            setSocket(newSocket);

            newSocket.on("getOnlineUsers", (users) => {
                setOnlineUsers(users);
            });

            return () => {
              newSocket.off("getOnlineUsers");
              newSocket.disconnect();
            };
        } else {
            if (socket) {
                socket.close();
                setSocket(null);
            }
        }
    }, [authUser]);

    // 👈 لازم تبعت الـ onlineUsers هنا
    return (
        <SocketContext.Provider value={{ socket, onlineUsers }}>
            {children}
        </SocketContext.Provider>
    );

};


