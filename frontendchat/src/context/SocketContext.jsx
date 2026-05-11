import { createContext, useState, useEffect, useContext } from "react";
import io from "socket.io-client";
import { useAuth } from "./AuthContext";
import useConversation from "../Zustans/useConversation";

const SocketContext = createContext();

export const useSocketContext = () => useContext(SocketContext);

export const SocketContextProvider = ({ children }) => {
    const [socket, setSocket] = useState(null);
    const [onlineUsers, setOnlineUsers] = useState([]); 
    const { authUser } = useAuth();

    useEffect(() => {
        if (authUser) {
            console.log('[SocketContext] initializing socket with userId=', authUser._id);
            const newSocket = io("http://localhost:3001", {
                auth: { userId: authUser._id },
                query: { userId: authUser._id },
            });

            setSocket(newSocket);

            newSocket.on("getOnlineUsers", (users) => {
                setOnlineUsers(users);
            });

            // forward call-related signaling events as window events so UI can react
            newSocket.on("incoming-call", (data) => {
                try { window.dispatchEvent(new CustomEvent('incoming-call', { detail: data })); } catch (e) {}
            });
            newSocket.on("call-answered", (data) => {
                try { window.dispatchEvent(new CustomEvent('call-answered', { detail: data })); } catch (e) {}
            });
            newSocket.on("ice-candidate", (data) => {
                try { window.dispatchEvent(new CustomEvent('ice-candidate', { detail: data })); } catch (e) {}
            });
            newSocket.on("call-ended", (data) => {
                try { window.dispatchEvent(new CustomEvent('call-ended', { detail: data })); } catch (e) {}
            });

            // SSE fallback: open EventSource to receive signaling when socket isn't available
            let es;
            try {
                const userId = authUser._id;
                es = new EventSource(`http://localhost:3001/events?userId=${encodeURIComponent(userId)}`);
                es.addEventListener('incoming-call', (e) => {
                    try { window.dispatchEvent(new CustomEvent('incoming-call', { detail: JSON.parse(e.data) })); } catch (err) {}
                });
                es.addEventListener('call-answered', (e) => {
                    try { window.dispatchEvent(new CustomEvent('call-answered', { detail: JSON.parse(e.data) })); } catch (err) {}
                });
                es.addEventListener('ice-candidate', (e) => {
                    try { window.dispatchEvent(new CustomEvent('ice-candidate', { detail: JSON.parse(e.data) })); } catch (err) {}
                });
                es.addEventListener('call-ended', (e) => {
                    try { window.dispatchEvent(new CustomEvent('call-ended', { detail: JSON.parse(e.data) })); } catch (err) {}
                });
                es.addEventListener('newmessages', (e) => {
                    try { window.dispatchEvent(new CustomEvent('newmessages', { detail: JSON.parse(e.data) })); } catch (err) {}
                });
            } catch (err) {
                console.warn('SSE not initialized', err);
            }

            const { setMessages } = useConversation.getState ? useConversation.getState() : { setMessages: () => {} };

            newSocket.on("connect", () => {
                console.log("Socket connected", newSocket.id);
            });

            newSocket.on("disconnect", (reason) => {
                console.log("Socket disconnected", reason);
            });

            const handleNewMessage = (newMessage) => {
                console.log("SocketContext received newmessages:", newMessage);
                // update Zustand messages store
                if (typeof setMessages === "function") {
                    setMessages((prev) => [...prev, newMessage]);
                }
            };

            newSocket.on("newmessages", handleNewMessage);

            return () => {
                newSocket.off("newmessages", handleNewMessage);
                newSocket.close();
                if (es) try { es.close(); } catch (e) {}
                setSocket(null);
            };
        } else {
            if (socket) {
                socket.close();
                setSocket(null);
            }
        }
    }, [authUser]);

    return (
        <SocketContext.Provider value={{ socket, onlineUsers }}>
            {children}
        </SocketContext.Provider>
    );
};
