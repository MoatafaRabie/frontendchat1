import {Navigate, Outlet,Route,createBrowserRouter ,createRoutesFromElements} from "react-router-dom";
import Nav from "../log/nav";
import Login from "../log/login";
import Signin from "../log/signin";
import Home from "../home/Home";
import { useAuth } from "../context/AuthContext";

const AppRoutes = () => {
 
const { authUser } = useAuth();

  return createBrowserRouter(
    createRoutesFromElements(
      <>
      <Route path="/" element={<><Nav /><Outlet/></>} />
        <Route path="/login" element={!authUser ? <Login  />: <Navigate to="/"/>} /> 
        <Route path="/signin" element={!authUser ? <Signin /> : <Navigate to="/"/>} /> 
        <Route path="/chat" element={ authUser ?<Home/>: <Navigate to="/login" />}/>
      <Route/>
      </>
    )
  );
};

export default AppRoutes;

