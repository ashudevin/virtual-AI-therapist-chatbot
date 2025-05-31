import React, { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import '../App.css';

const LandingPage = () => {
  const heroRef = useRef(null);
  const featureRef = useRef(null);

  useEffect(() => {
    // Animation for hero section
    const heroElement = heroRef.current;
    if (heroElement) {
      heroElement.classList.add('animate-fade-in');
    }

    // Animate features on scroll
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('animate-slide-up');
          }
        });
      },
      { threshold: 0.2 }
    );

    const featureElements = featureRef.current?.querySelectorAll('.feature-card');
    if (featureElements) {
      featureElements.forEach((el) => observer.observe(el));
    }

    return () => {
      if (featureElements) {
        featureElements.forEach((el) => observer.unobserve(el));
      }
    };
  }, []);

  return (
    <div className="landing-page">
      {/* Hero Section */}
      <section className="hero-section" ref={heroRef}>
        <div className="hero-content">
          <div className="hero-text">
            <h1>Your Virtual <span className="highlight">Therapy</span> Companion</h1>
            <p>
              A safe space for mental wellness, available whenever you need support.
              Our AI-powered therapist is here to listen and guide you 24/7.
            </p>
            <div className="hero-buttons">
              <Link to="/login" className="btn btn-primary">
                Sign In
              </Link>
              <Link to="/signup" className="btn btn-secondary">
                Create Account
              </Link>
            </div>
          </div>
          <div className="hero-image">
            <div className="circle-animation"></div>
            <div className="chat-illustration">
              <div className="chat-bubble left">
                <p>How are you feeling today?</p>
              </div>
              <div className="chat-bubble right">
                <p>I've been feeling anxious lately...</p>
              </div>
              <div className="chat-bubble left">
                <p>Let's explore that together...</p>
                <div className="typing-dots">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="features-section" ref={featureRef}>
        <h2>How Our Virtual Therapist Helps</h2>
        <div className="features-grid">
          <div className="feature-card">
            <div className="feature-icon support"></div>
            <h3>24/7 Support</h3>
            <p>Access therapeutic conversations whenever you need them, day or night.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon privacy"></div>
            <h3>Complete Privacy</h3>
            <p>Your conversations are secure and confidential.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon growth"></div>
            <h3>Personal Growth</h3>
            <p>Develop coping strategies and self-awareness through guided conversations.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon accessible"></div>
            <h3>Accessible Care</h3>
            <p>Remove barriers to mental health support with our easy-to-use platform.</p>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="cta-section">
        <div className="cta-content">
          <h2>Begin Your Wellness Journey Today</h2>
          <p>Take the first step toward better mental health.</p>
          <div className="cta-buttons">
            <Link to="/signup" className="btn btn-primary">
              Get Started
            </Link>
          </div>
        </div>
        <div className="wave-animation">
          <div className="wave wave1"></div>
          <div className="wave wave2"></div>
          <div className="wave wave3"></div>
        </div>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <p>© {new Date().getFullYear()} Virtual Therapist System. All rights reserved.</p>
        <p>This is an AI-powered support tool and not a replacement for professional mental health services.</p>
      </footer>
    </div>
  );
};

export default LandingPage; 