import {Navigate, Outlet,Route,createBrowserRouter ,createRoutesFromElements} from "react-router-dom";
import Nav from "../log/nav";
import Login from "../log/login";
import Signin from "../log/signin";
import { useState } from "react";
import Home from "../home/Home";
import { useAuth } from "../context/AuthContext";

const AppRoutes = () => {
  const [isloggedin, setisloggedin] = useState(() => {
  return !!localStorage.getItem("currentUser");
});
const { authUser } = useAuth();

  return createBrowserRouter(
    createRoutesFromElements(
      <>
      <Route index element={<Nav/>} />
        <Route path="/" element={<><Nav isloggedin={isloggedin} setisloggedin={setisloggedin} /><Outlet/></>} /> 
        <Route path="/login" element={!authUser ? <Login setisloggedin={setisloggedin} />: <Navigate to="/"/>} /> 
        <Route path="/signin" element={!authUser ? <Signin /> : <Navigate to="/"/>} /> 
        <Route path="/chat" element={ authUser ?<Home/>: <Navigate to="/login" />}/>
      <Route/>
      </>
    )
  );
};

export default AppRoutes;
