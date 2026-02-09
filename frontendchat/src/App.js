import { RouterProvider } from "react-router-dom";
import AppRoutes from './routing/route';
import { SocketContextProvider } from './context/SocketContext'; 
import { AuthContextProvider } from './context/AuthContext'; 

const App = () => {
  const router = AppRoutes();

  return (
    <div className="App">
      <AuthContextProvider> 
        <SocketContextProvider>
          <RouterProvider router={router} />
        </SocketContextProvider>
      </AuthContextProvider>
    </div>
  );
}

export default App;