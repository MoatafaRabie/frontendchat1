import { useState } from "react";
import Sidebar from "./components/Sidebar";
import MessageContainer from "./components/MessageContainer";

const Home = () => {
  const [showSidebar, setShowSidebar] = useState(false);

  return (
    <div className="flex h-screen w-full bg-gray-900 overflow-hidden">

      <div
        className={`
          fixed inset-y-0 left-0 z-40 w-72 bg-gray-800 border-r border-gray-700
          transform transition-transform duration-300
          ${showSidebar ? "translate-x-0" : "-translate-x-full"}
          md:relative md:translate-x-0 md:w-1/4 md:min-w-[250px]
        `}
      >
        <Sidebar closeSidebar={() => setShowSidebar(false)} />
      </div>

      {showSidebar && (
        <div
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={() => setShowSidebar(false)}
        />
      )}

      <div className="flex-1 flex flex-col bg-gray-900">

        <div className="md:hidden flex items-center gap-3 p-4 border-b border-gray-700 bg-gray-800">
          <button
            onClick={() => setShowSidebar(true)}
            className="text-white"
          >
            ☰
          </button>
          <h1 className="text-white font-semibold text-lg">Chat</h1>
        </div>

        <MessageContainer />
      </div>
    </div>
  );
};

export default Home;
