import React from "react";

// Catches render/runtime JS errors anywhere in the tree and shows a friendly
// message instead of a blank white screen.
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error("ErrorBoundary caught an error:", error, info);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          data-testid="error-boundary"
          className="min-h-screen bg-[#0d1117] flex flex-col items-center justify-center px-6 text-center"
        >
          <div className="max-w-md">
            <h1 className="font-display font-black uppercase tracking-tight text-2xl text-white">
              Something went wrong
            </h1>
            <p className="text-zinc-400 text-sm mt-3">
              Something went wrong. Please refresh the page.
            </p>
            <button
              data-testid="error-boundary-reload"
              onClick={this.handleReload}
              className="mt-6 inline-flex items-center gap-2 bg-[#39FF14] text-black font-black uppercase text-sm tracking-wider px-5 py-2.5 rounded-lg hover:brightness-110 transition"
            >
              Refresh
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
