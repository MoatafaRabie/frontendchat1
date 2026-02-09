import { RouterProvider } from "react-router-dom";
import AppRoutes from './routing/route';
import { SocketContextProvider } from './context/SocketContext'; 
import { AuthContextProvider } from './context/AuthContext'; 

const App = () => {
  const router = AppRoutes();

  return (
    <div className="App">
      <RouterProvider router={router} />
    </div>
  );
}

export default App;
