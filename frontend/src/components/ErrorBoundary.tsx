import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

interface Props {
    children: ReactNode;
    fallback?: ReactNode;
    name?: string;
}

interface State {
    hasError: boolean;
}

class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false
    };

    public static getDerivedStateFromError(_: Error): State {
        return { hasError: true };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error(`ErrorBoundary caught error in ${this.props.name || 'component'}:`, error, errorInfo);
    }

    public render() {
        if (this.state.hasError) {
            return this.props.fallback || (
                <div className="state-container" style={{ padding: '2rem', textAlign: 'center', border: '1px solid var(--border)', borderRadius: '12px', background: 'rgba(255,0,0,0.05)' }}>
                    <h3>Oops! Something went wrong.</h3>
                    <p>The {this.props.name || 'section'} failed to load. Please try refreshing.</p>
                    <button className="quote-btn" onClick={() => this.setState({ hasError: false })}>Try Again</button>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
