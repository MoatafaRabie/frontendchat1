import { createContext, useContext, useState, useEffect } from "react";

export const AuthContext = createContext();

export const useAuth = () => {
    return useContext(AuthContext);
};

export const AuthContextProvider = ({ children }) => {
    const [authUser, setAuthUser] = useState(JSON.parse(localStorage.getItem('chatapp')) || null);

    useEffect(() => {
        if (authUser) {
            localStorage.setItem('chatapp', JSON.stringify(authUser));
        } else {
            localStorage.removeItem('chatapp');
        }
    }, [authUser]);

    return (
        <AuthContext.Provider value={{ authUser, setAuthUser }}>
            {children}
        </AuthContext.Provider>
    );
};