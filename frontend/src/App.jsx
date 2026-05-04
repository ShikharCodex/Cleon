import { SignInButton, SignUpButton, UserButton, Show } from "@clerk/react";
import "./App.css";
import PageLoader from "./components/PageLoader";
import { useAuth } from "@clerk/react";
import Layout from "./components/Layout";

function App() {

  const {isLoaded} = useAuth();
  if(!isLoaded) return <PageLoader />;
  return (
    <Layout>
      <header>
        <Show when="signed-out">
          <SignInButton mode="modal" />
          <SignUpButton mode="modal" />
        </Show>
        <Show when="signed-in">
          <UserButton />
        </Show>
      </header>
      <button className="btn btn-primary">Test</button>
      <button className="btn btn-secondary">Test</button>
      <button className="btn btn-ordinary">Test</button>
    </Layout>
  );
}

export default App;
