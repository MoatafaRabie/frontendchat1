import Sidebar from "./components/Sidebar";
import MessageContainer from "./components/MessageContainer";

const Home = () => {
    return (
        <div className='flex h-screen w-full rounded-none overflow-hidden bg-gray-400 bg-clip-padding backdrop-filter backdrop-blur-lg bg-opacity-0'>
    <div className='w-1/4 min-w-[250px] border-r border-slate-500 flex flex-col'>
        <Sidebar />
    </div>

    <div className='flex-1 flex flex-col'>
        <MessageContainer />
    </div>
</div>
    );
};
export default Home;