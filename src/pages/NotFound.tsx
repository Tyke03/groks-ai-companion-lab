import { Link } from "react-router-dom";
import { Layout } from "@/components/Layout";

const NotFound = () => (
  <Layout>
    <main id="main-content" tabIndex={-1} className="container mx-auto px-4 py-20 text-center">
      <h1 className="mb-4 font-display text-4xl font-bold text-foreground">404</h1>
      <p className="mb-6 text-xl text-muted-foreground">This page is not in the directory.</p>
      <Link to="/" className="text-primary underline hover:text-primary/90">
        Return to the directory
      </Link>
    </main>
  </Layout>
);

export default NotFound;
