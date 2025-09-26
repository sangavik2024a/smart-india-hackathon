import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Section, ScanResults, SavedScan } from './types';
import { getMarineOrganismCounts } from './services/geminiService';

// --- UTILITY FUNCTIONS ---
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const normalizeAngle = (a: number) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};

// --- CUSTOM HOOKS ---
const useAnimatedCounter = (target: number, duration = 1500): string => {
  const [count, setCount] = useState(0);
  const countRef = useRef(count);

  useEffect(() => {
    let startTime: number;
    const startCount = countRef.current;
    
    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      const newCount = Math.floor(lerp(startCount, target, progress));
      setCount(newCount);
      
      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };
    
    requestAnimationFrame(animate);
    
    return () => {
      countRef.current = target;
    }
  }, [target, duration]);

  return count.toLocaleString();
};

// --- STYLES COMPONENT ---
const GlobalStyles: React.FC = () => (
  <style>{`
    body {
        font-family: 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        overflow-x: hidden;
        background: linear-gradient(to bottom, #0c1a2e, #040f1a 80%);
        color: white;
        line-height: 1.6;
        font-weight: 400;
        min-height: 100vh;
    }
    .particles { position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: 1; pointer-events: none; }
    .particle { position: absolute; background: rgba(147, 197, 253, 0.6); border-radius: 50%; animation-name: floatParticle; animation-timing-function: ease-in-out; animation-iteration-count: infinite; }
    @keyframes floatParticle {
      0%, 100% { transform: translateY(0px) translateX(0px); opacity: 0.3; }
      25% { transform: translateY(-100px) translateX(50px); opacity: 0.8; }
      50% { transform: translateY(-50px) translateX(-33px); opacity: 1; }
      75% { transform: translateY(-120px) translateX(25px); opacity: 0.6; }
    }
    .section { display: none; width: 100%; max-width: 1400px; text-align: center; opacity: 0; transform: translateY(60px); transition: all 0.8s cubic-bezier(0.4, 0.0, 0.2, 1); }
    .section.active { display: block; opacity: 1; transform: translateY(0); }
    .hero h1 { font-size: clamp(4rem, 8vw, 7rem); font-weight: 800; margin-bottom: 24px; background: linear-gradient(135deg, #ffffff, #93c5fd, #3b82f6); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; letter-spacing: -2px; line-height: 0.9; }
    .hero p { font-size: clamp(1.1rem, 2vw, 1.4rem); margin-bottom: 60px; opacity: 0.8; max-width: 700px; margin-left: auto; margin-right: auto; font-weight: 300; line-height: 1.7; }
    @keyframes pulse { 0% { transform: scale(1); opacity: 1; } 100% { transform: scale(1.4); opacity: 0; } }
    @keyframes glow { from { opacity: 0.6; } to { opacity: 1; text-shadow: 0 0 20px rgba(147, 197, 253, 0.5); } }
    @keyframes scan-sweep { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    .loading { display: inline-block; width: 20px; height: 20px; border: 2px solid rgba(255, 255, 255, 0.3); border-radius: 50%; border-top-color: white; animation: spin 1s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
  `}</style>
);


// --- UI & EFFECTS COMPONENTS ---

const Particles: React.FC = () => {
    const particlesRef = useRef<HTMLDivElement>(null);
  
    useEffect(() => {
      const container = particlesRef.current;
      if (!container) return;
  
      const particleCount = window.innerWidth < 768 ? 30 : 60;
      for (let i = 0; i < particleCount; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle';
        
        const rand = Math.random();
        let size = 2;
        if (rand > 0.8) size = 4; else if (rand > 0.6) size = 3;
        
        particle.style.width = `${size}px`;
        particle.style.height = `${size}px`;
        particle.style.left = `${Math.random() * 100}%`;
        particle.style.top = `${Math.random() * 100}%`;
        particle.style.animationDuration = `${Math.random() * 15 + 10}s`;
        particle.style.animationDelay = `${Math.random() * 5}s`;
        
        container.appendChild(particle);
      }
      return () => { container.innerHTML = '' };
    }, []);
  
    return <div ref={particlesRef} className="particles"></div>;
};

interface SwimCanvasProps {
  id: string;
}

const SwimCanvas: React.FC<SwimCanvasProps> = ({ id }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const schoolRef = useRef<any[]>([]);
    const leadersRef = useRef<any[]>([]);
    const animationFrameId = useRef<number | null>(null);

    const drawFish = (fish: any, ctx: CanvasRenderingContext2D) => {
        ctx.save();
        ctx.translate(fish.x, fish.y);
        ctx.rotate(fish.angle);
        
        const len = fish.size;
        ctx.fillStyle = 'hsla(220, 40%, 15%, 0.7)';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(len / 2, len / 3, len, 0);
        ctx.quadraticCurveTo(len / 2, -len / 3, 0, 0);
        ctx.fill();
        
        ctx.restore();
    };

    const animate = useCallback(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx) return;

        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        ctx.clearRect(0, 0, width, height);
        
        const time = Date.now() * 0.0001;

        leadersRef.current.forEach(leader => {
            leader.x = (width / 2) + Math.cos(time * leader.speed + leader.offset) * (width * 0.4);
            leader.y = (height / 2) + Math.sin(time * leader.speed * 0.7 + leader.offset) * (height * 0.3);
        });

        schoolRef.current.forEach(fish => {
            const leader = leadersRef.current[fish.leaderIndex];
            
            const targetX = leader.x + fish.offsetX;
            const targetY = leader.y + fish.offsetY;

            const dx = targetX - fish.x;
            const dy = targetY - fish.y;
            
            const targetAngle = Math.atan2(dy, dx);
            const angleDiff = normalizeAngle(targetAngle - fish.angle);
            
            fish.angle += angleDiff * fish.turnSpeed;
            
            const speed = Math.hypot(dx, dy) * 0.05;
            fish.x += Math.cos(fish.angle) * speed;
            fish.y += Math.sin(fish.angle) * speed;
            
            drawFish(fish, ctx);
        });

        animationFrameId.current = requestAnimationFrame(animate);
    }, []);

    const setupCanvas = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const parent = document.body;
        if (!parent) return;

        const rect = parent.getBoundingClientRect();
        canvas.width = rect.width * devicePixelRatio;
        canvas.height = rect.height * devicePixelRatio;
        canvas.style.width = `${rect.width}px`;
        canvas.style.height = `${rect.height}px`;

        const ctx = canvas.getContext('2d');
        ctx?.scale(devicePixelRatio, devicePixelRatio);

        const width = rect.width;
        const height = rect.height;

        const numLeaders = 3;
        leadersRef.current = Array.from({ length: numLeaders }, (_, i) => ({
            x: Math.random() * width,
            y: Math.random() * height,
            speed: 0.5 + Math.random() * 0.5,
            offset: Math.random() * Math.PI * 2,
        }));
        
        const numFish = 70;
        schoolRef.current = Array.from({ length: numFish }, () => ({
            x: Math.random() * width,
            y: Math.random() * height,
            angle: Math.random() * Math.PI * 2,
            size: 18 + Math.random() * 12,
            leaderIndex: Math.floor(Math.random() * numLeaders),
            offsetX: (Math.random() - 0.5) * 150,
            offsetY: (Math.random() - 0.5) * 150,
            turnSpeed: 0.05 + Math.random() * 0.05
        }));

    }, []);
    
    useEffect(() => {
        setupCanvas();
        animationFrameId.current = requestAnimationFrame(animate);

        const handleResize = () => setupCanvas();
        window.addEventListener('resize', handleResize);
        
        return () => {
            if (animationFrameId.current) {
                cancelAnimationFrame(animationFrameId.current);
            }
            window.removeEventListener('resize', handleResize);
        };
    }, [setupCanvas, animate]);

    return <canvas id={id} ref={canvasRef} className="fixed top-0 left-0 w-full h-full z-0 pointer-events-none"></canvas>;
};

const MicroscopeLens: React.FC<{ theme: 'blue' | 'green' }> = ({ theme }) => {
  const gradients = {
    blue: {
      grad1: "url(#gradient1)", grad2: "url(#gradient2)", grad3: "url(#gradient3)",
    },
    green: {
      grad1: "url(#scanGradient1)", grad2: "url(#scanGradient2)", grad3: "url(#scanGradient3)",
    }
  };
  const currentTheme = gradients[theme];
  
  return (
    <svg width="200" height="200" viewBox="0 0 200 200" className="w-full h-full relative z-10">
      <defs>
        <radialGradient id="gradient1" cx="50%" cy="50%" r="50%" fx="50%" fy="50%">
          <stop offset="0%" style={{ stopColor: "rgba(147, 197, 253, 0.1)" }} />
          <stop offset="70%" style={{ stopColor: "rgba(59, 130, 246, 0.1)" }} />
          <stop offset="100%" style={{ stopColor: "rgba(30, 64, 175, 0.2)" }} />
        </radialGradient>
        <radialGradient id="gradient2" cx="50%" cy="50%" r="50%">
          <stop offset="85%" stopColor="transparent" />
          <stop offset="100%" stopColor="rgba(147, 197, 253, 0.3)" />
        </radialGradient>
        <linearGradient id="gradient3" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.2)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </linearGradient>
        <radialGradient id="scanGradient1" cx="50%" cy="50%" r="50%" fx="50%" fy="50%">
          <stop offset="0%" style={{ stopColor: "rgba(74, 222, 128, 0.1)" }} />
          <stop offset="70%" style={{ stopColor: "rgba(34, 197, 94, 0.1)" }} />
          <stop offset="100%" style={{ stopColor: "rgba(21, 128, 61, 0.2)" }} />
        </radialGradient>
        <radialGradient id="scanGradient2" cx="50%" cy="50%" r="50%">
          <stop offset="85%" stopColor="transparent" />
          <stop offset="100%" stopColor="rgba(74, 222, 128, 0.3)" />
        </radialGradient>
        <linearGradient id="scanGradient3" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.2)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </linearGradient>
      </defs>
      <circle cx="100" cy="100" r="98" fill={currentTheme.grad1} />
      <circle cx="100" cy="100" r="98" fill="none" stroke={currentTheme.grad2} strokeWidth="2" />
      <circle cx="100" cy="100" r="90" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="0.5" />
      <path d="M 20, 100 A 80 80, 0, 0, 1, 180 100" fill="none" stroke={currentTheme.grad3} strokeWidth="1.5" />
    </svg>
  );
};

interface HeaderProps {
  currentSection: Section;
  onNavigate: (section: Section) => void;
}
const Header: React.FC<HeaderProps> = ({ currentSection, onNavigate }) => (
  <header className="relative w-full flex justify-center z-50 py-8">
    <div className="bg-black/20 backdrop-blur-md rounded-full border border-white/10 shadow-lg p-2">
        <nav className="flex items-center gap-2">
        {(Object.values(Section)).map((section) => (
            <button
            key={section}
            onClick={() => onNavigate(section)}
            className={`px-6 py-2 rounded-full text-sm font-medium text-gray-300 transition-all duration-300 relative overflow-hidden hover:text-white hover:-translate-y-0.5 ${currentSection === section ? 'active text-white' : ''}`}
            >
            <span className={`absolute inset-0 bg-gradient-to-r from-blue-500/20 to-blue-300/10 rounded-full transition-transform duration-300 ${currentSection === section ? 'scale-x-100' : 'scale-x-0'} origin-left`}></span>
            <span className="relative z-10 capitalize">{section}</span>
            </button>
        ))}
        </nav>
    </div>
  </header>
);

interface SectionProps {
  id: string;
  isActive: boolean;
  children: React.ReactNode;
}
const SectionContainer: React.FC<SectionProps> = ({ id, isActive, children }) => (
  <section id={id} className={`section relative z-10 ${isActive ? 'active' : ''}`}>{children}</section>
);

interface HomeProps {
    onNavigate: (section: Section) => void;
}
const Home: React.FC<HomeProps> = ({ onNavigate }) => (
  <>
    <div className="hero relative z-10">
      <h1>SeaLens</h1>
      <p>Advanced embedded intelligent microscopy system for precise identification and automated counting of microscopic marine organisms</p>
      
      <div className="microscope-container group mx-auto my-12 cursor-pointer flex items-center justify-center" onClick={() => onNavigate(Section.About)}>
        <div className="microscope-circle w-80 h-80 border-[3px] border-blue-500/30 rounded-full bg-gradient-to-br from-blue-400/10 to-slate-900/80 flex items-center justify-center transition-all duration-500 relative overflow-hidden backdrop-blur-xl shadow-2xl shadow-black/30 group-hover:scale-105 group-hover:border-blue-500/60 group-hover:shadow-2xl group-hover:shadow-blue-500/20">
          <img 
              src="https://images.unsplash.com/photo-1576052842790-a335ae74338a?q=80&w=500&auto=format&fit=crop" 
              alt="" 
              className="absolute inset-0 w-full h-full object-cover rounded-full opacity-40 group-hover:opacity-60 transition-all duration-500 scale-105 group-hover:scale-110" 
          />
          <div className="absolute inset-0 border-2 border-blue-500/20 rounded-full animate-[pulse_3s_infinite]" />
          <div className="absolute inset-0 border-2 border-blue-300/30 rounded-full animate-[pulse_3s_1.5s_infinite]" />
          <div className="absolute inset-0">
            <MicroscopeLens theme="blue" />
          </div>
          <div className="relative z-10 w-full h-full flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
            <span className="text-7xl" role="img" aria-label="Microscope">🔬</span>
          </div>
        </div>
      </div>
    </div>
  </>
);

const missionData = [
    { title: 'Precision', description: 'Achieve over 98% accuracy in organism identification with our advanced AI models.', bgImage: 'https://images.unsplash.com/photo-1578496459837-e537d3539a26?q=80&w=400&auto=format&fit=crop' },
    { title: 'Speed', description: 'Analyze samples in minutes, not hours, accelerating research cycles dramatically.', bgImage: 'https://images.unsplash.com/photo-1599008682312-3bffb0a49852?q=80&w=400&auto=format&fit=crop' },
    { title: 'Automation', description: 'From sample loading to data reporting, our system minimizes manual intervention.', bgImage: 'https://images.unsplash.com/photo-1633596683416-d1193a0d1e37?q=80&w=400&auto=format&fit=crop' },
    { title: 'Insight', description: 'Gain deeper understanding with real-time analytics and comprehensive data visualization.', bgImage: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?q=80&w=400&auto=format&fit=crop' },
    { title: 'Adaptability', description: 'Optimized for diverse marine environments, from coastal waters to deep-sea vents.', bgImage: 'https://images.unsplash.com/photo-1629114757040-5b967f98d1e3?q=80&w=400&auto=format&fit=crop' },
    { title: 'Accessibility', description: 'A rugged, portable design brings powerful lab-grade analysis to the field.', bgImage: 'https://images.unsplash.com/photo-1614527375258-390977a42a4e?q=80&w=400&auto=format&fit=crop' },
];

const About: React.FC = () => {
    const keyDifferences = [
        { title: "Portable & Field-Deployable", description: "Works anywhere—river, sea, aquaculture farm—unlike existing lab- or ship-based setups.", icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11c0 3.517-1.009 6.789-2.75 9.565M12 11c0-3.517.99-6.789 2.75-9.565M12 11H3.344c-1.849 0-2.5-2.28-1.06-3.283l8.6-6.024a2.25 2.25 0 012.232 0l8.6 6.024c1.44 1.003.788 3.283-1.06 3.283H12z" /></svg> },
        { title: "Real-Time Analysis", description: "Instantly identifies and counts plankton on-site. No waiting for lab processing or delayed results.", icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> },
        { title: "Focused & Targeted", description: "Classifies 3–5 key plankton species important for monitoring, giving precise, actionable data.", icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18M9 4v16m6-16v16" /></svg> },
        { title: "Embedded AI Processing", description: "Uses small, low-power computing (Raspberry Pi / Jetson) to process images on the device, not reliant on a remote server.", icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M12 6a6 6 0 100 12 6 6 0 000-12z" /></svg> },
        { title: "Simple & Accessible Interface", description: "Counts and shows results immediately on a screen; intuitive for users without specialized training.", icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg> },
        { title: "Cost-Effective & Scalable", description: "Uses regular microscopes and cameras instead of expensive lab-grade equipment, making it scalable for multiple locations.", icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 13v-1m-4.5-9.5L6 6m12 12l-1.5-1.5M12 12a2 2 0 100-4 2 2 0 000 4z" /></svg> },
    ];
    
    return (
        <div className="relative z-10">
            <h1 className="text-4xl md:text-5xl font-bold mb-16">About SeaLens</h1>
            <div className="max-w-4xl mx-auto mb-24">
                <h2 className="text-3xl md:text-4xl mb-4 font-semibold bg-gradient-to-r from-white to-blue-300 bg-clip-text text-transparent">Why SeaLens is Crucial</h2>
                <p className="text-lg opacity-80 text-left">Microscopic organisms like plankton are the foundation of the marine food web and play a vital role in global carbon cycles. Monitoring their populations is essential for understanding ocean health, predicting harmful algal blooms, and managing sustainable aquaculture. SeaLens provides the critical, real-time data that researchers and industries need to make informed decisions, protecting both ecosystems and economies.</p>
            </div>
            
            <div className="text-center">
                <h3 className="text-3xl md:text-4xl mb-12 font-semibold bg-gradient-to-r from-white to-blue-300 bg-clip-text text-transparent">
                    Our Core Capabilities
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 justify-items-center max-w-7xl mx-auto">
                    {missionData.map((item, index) => (
                        <div key={index} className="group relative h-72 w-full max-w-sm rounded-2xl overflow-hidden transition-all duration-700 ease-in-out shadow-lg hover:shadow-blue-500/20 bg-slate-900/50 border border-blue-500/10">
                            <div
                                style={{ backgroundImage: `linear-gradient(to top, rgba(0,0,0,0.9), rgba(0,0,0,0.6), transparent), url(${item.bgImage})` }}
                                className="absolute inset-0 bg-cover bg-center transition-all duration-500 opacity-0 group-hover:opacity-100 group-hover:scale-110"
                            ></div>
                            <div className="relative z-10 p-6 flex flex-col items-center justify-center text-center h-full text-white w-full">
                                <div className="transition-transform duration-500 ease-in-out transform group-hover:-translate-y-4">
                                    <h4 className="text-2xl font-bold">{item.title}</h4>
                                    <p className="mt-2 text-base font-light max-h-0 opacity-0 group-hover:max-h-40 group-hover:opacity-90 transition-all duration-500 delay-100 ease-in-out">
                                        {item.description}
                                    </p>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <div className="mt-24 max-w-6xl mx-auto">
                <h2 className="text-3xl md:text-4xl mb-12 font-semibold bg-gradient-to-r from-white to-blue-300 bg-clip-text text-transparent">Why Our System Stands Out</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {keyDifferences.map((item, index) => (
                        <div key={index} className="bg-slate-900/50 p-6 rounded-2xl border border-blue-500/10 text-left flex flex-col items-start gap-4 hover:-translate-y-2 transition-transform duration-300">
                            <div className="text-blue-400 bg-blue-900/50 p-3 rounded-full">{item.icon}</div>
                            <h4 className="text-xl font-bold">{item.title}</h4>
                            <p className="opacity-80 font-light">{item.description}</p>
                        </div>
                    ))}
                </div>
            </div>

            <div className="max-w-4xl mx-auto mt-24">
                <h2 className="text-3xl md:text-4xl mb-4 font-semibold bg-gradient-to-r from-white to-blue-300 bg-clip-text text-transparent">Meet the Team</h2>
                <p className="text-lg opacity-80">Our Team: Keertana , Lakshnaa BJ , Nividitha S , Priya Vaishanavi , K Sangavi , Siva Varsha.</p>
            </div>
        </div>
    );
};

interface ScanningProps {
    onSaveScan: (results: ScanResults, imageFile: File) => void;
}
const Scanning: React.FC<ScanningProps> = ({ onSaveScan }) => {
    const [isScanning, setIsScanning] = useState(false);
    const [scanResults, setScanResults] = useState<ScanResults | null>(null);
    const [showResults, setShowResults] = useState(false);
    const [uploadedFile, setUploadedFile] = useState<File | null>(null);
    const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [isDataSaved, setIsDataSaved] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const justDropped = useRef(false);
    
    const planktonCount = useAnimatedCounter(showResults ? scanResults?.plankton?.count ?? 0 : 0);
    const algaeCount = useAnimatedCounter(showResults ? scanResults?.algae?.count ?? 0 : 0);
    const bacteriaCount = useAnimatedCounter(showResults ? scanResults?.bacteria?.count ?? 0 : 0);
    const protozoaCount = useAnimatedCounter(showResults ? scanResults?.protozoa?.count ?? 0 : 0);
    
    useEffect(() => {
        return () => { if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl); };
    }, [filePreviewUrl]);

    const handleFileChange = (file: File | null) => {
        if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
        if (file && file.type.startsWith('image/')) {
            setUploadedFile(file);
            setFilePreviewUrl(URL.createObjectURL(file));
            setShowResults(false);
            setScanResults(null);
            setIsDataSaved(false);
        } else {
            setUploadedFile(null);
            setFilePreviewUrl(null);
        }
    };

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); setIsDragging(true); };
    const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); setIsDragging(false); };
    
    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleFileChange(e.dataTransfer.files[0]);
            justDropped.current = true;
            setTimeout(() => { justDropped.current = false; }, 100);
        }
    };

    const handleDropZoneClick = () => {
        if (justDropped.current) return;
        fileInputRef.current?.click();
    };

    const onFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        handleFileChange(e.target.files && e.target.files.length > 0 ? e.target.files[0] : null);
    };

    const startScan = async () => {
        if (isScanning || !uploadedFile) return;
        setIsScanning(true);
        setShowResults(false);
        setIsDataSaved(false);
        await new Promise(resolve => setTimeout(resolve, 2000));
        const results = await getMarineOrganismCounts();
        setScanResults(results);
        setIsScanning(false);
        if (results) setTimeout(() => setShowResults(true), 100);
    };

    const resetScan = () => {
        setIsScanning(false);
        setShowResults(false);
        setScanResults(null);
        handleFileChange(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    const handleSaveClick = () => {
        if (!scanResults || !uploadedFile || isDataSaved) return;
        onSaveScan(scanResults, uploadedFile);
        setIsDataSaved(true);
    };

    const resultsData = [
      { label: 'Plankton', animatedCount: planktonCount, data: scanResults?.plankton },
      { label: 'Algae', animatedCount: algaeCount, data: scanResults?.algae },
      { label: 'Bacteria', animatedCount: bacteriaCount, data: scanResults?.bacteria },
      { label: 'Protozoa', animatedCount: protozoaCount, data: scanResults?.protozoa },
    ];

    return (
        <div className="w-full">
            <div className="text-center mb-12">
                <h1 className="text-4xl md:text-5xl font-bold">Live Analysis Demo</h1>
                <p className="text-lg opacity-80 mt-2">
                    {showResults ? 'Analysis of your uploaded sample.' : 'Upload an image of a water sample to begin analysis.'}
                </p>
            </div>
            
            <div className={`flex flex-col md:flex-row justify-center gap-8 lg:gap-16 w-full min-h-[500px] ${showResults ? 'md:items-stretch' : 'md:items-center'}`}>
                <div className={`flex flex-col items-center transition-all duration-700 ease-in-out ${showResults ? 'w-full md:w-1/2 max-w-md' : 'w-full'}`}>
                    <div className={`group scanning-microscope mx-auto relative bg-gradient-to-br from-green-500/10 via-slate-900/90 to-black/80 border-[3px] border-green-500/30 flex items-center justify-center overflow-hidden backdrop-blur-xl transition-all duration-700 ease-in-out ${isScanning ? 'scanning border-green-500/80 shadow-[0_0_60px_rgba(34,197,94,0.4),_inset_0_0_40px_rgba(34,197,94,0.1)]' : ''} ${showResults ? 'rounded-3xl w-full h-full' : 'rounded-full w-80 h-80 lg:w-96 lg:h-96'}`}>
                        {showResults && filePreviewUrl ? <img src={filePreviewUrl} alt="Scan preview" className="w-full h-full object-cover" /> : <> {isScanning && <div className="absolute w-4/5 h-4/5 rounded-full bg-[conic-gradient(from_0deg,transparent,rgba(34,197,94,0.6),transparent)] animate-[scan-sweep_2s_linear_infinite]" />} <MicroscopeLens theme="green" /> </>}
                    </div>
                    {!showResults && (
                        <>
                            <div onDrop={handleDrop} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onClick={handleDropZoneClick} className={`mt-12 w-full max-w-sm h-32 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center text-center cursor-pointer transition-colors duration-300 ${isDragging ? 'border-green-400 bg-green-500/10' : 'border-gray-600 hover:border-gray-400'}`} role="button" aria-label="File upload drop zone">
                                <input type="file" ref={fileInputRef} onChange={onFileInputChange} className="hidden" accept="image/*" />
                                {filePreviewUrl && uploadedFile ? <div className="text-gray-300 p-2"><p>File ready for analysis:</p><p className="font-medium text-white truncate">{uploadedFile.name}</p></div> : <p className="text-gray-400 px-4">Drag & drop an image, or click to select</p>}
                            </div>
                            <div className="scan-controls mt-8 flex gap-6 justify-center flex-wrap">
                                <button onClick={startScan} disabled={!uploadedFile || isScanning} className="scan-btn px-8 py-4 bg-gradient-to-r from-green-600 to-green-500 rounded-full text-white text-base font-medium cursor-pointer transition-all duration-300 relative overflow-hidden min-w-[160px] hover:-translate-y-0.5 hover:shadow-2xl hover:shadow-green-500/30 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none">
                                    <span className="flex items-center justify-center">{isScanning ? 'Analyzing...' : 'Start Analysis'}{isScanning && <span className="loading ml-2"></span>}</span>
                                </button>
                                <button onClick={resetScan} className="scan-btn px-8 py-4 bg-gradient-to-r from-gray-700 to-gray-600 rounded-full text-white text-base font-medium cursor-pointer transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-gray-500/20">Reset System</button>
                            </div>
                        </>
                    )}
                </div>
                <div className={`transition-all duration-700 ease-in-out overflow-hidden ${showResults ? 'w-full md:w-1/2 max-w-md' : 'w-0 max-w-0'}`}>
                    <div className={`results p-8 bg-gradient-to-br from-slate-900/80 to-black/40 rounded-2xl backdrop-blur-xl border border-green-500/20 transition-opacity duration-500 delay-300 ${showResults ? 'opacity-100' : 'opacity-0'}`}>
                        <h3 className="text-green-400 mb-6 text-2xl font-semibold text-left">Analysis Results</h3>
                        <p className="opacity-80 text-left mb-4">Microscopic organisms detected:</p>
                        <div className="organism-count flex flex-col gap-4">
                          {resultsData.map(item => (
                             <div key={item.label} className="count-item bg-slate-900/60 p-4 rounded-xl border border-blue-500/10 hover:-translate-y-1 hover:border-green-500/30 transition-all flex justify-between items-center">
                                <span className="count-label font-light opacity-80 text-lg">{item.label}</span>
                                <div className="text-right">
                                    <span className="count-number text-2xl font-bold text-green-400">{item.animatedCount}</span>
                                    {item.data && <span className="text-xs text-green-300/70 ml-2">({(item.data.accuracy * 100).toFixed(1)}% acc.)</span>}
                                </div>
                            </div>
                          ))}
                        </div>
                    </div>
                </div>
            </div>
            {showResults && (
                <div className="w-full mt-8 flex gap-6 justify-center">
                    <button onClick={handleSaveClick} disabled={isDataSaved} className="px-8 py-4 bg-gradient-to-r from-gray-700 to-gray-600 rounded-full text-white text-base font-medium cursor-pointer transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-gray-500/20 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none">
                        {isDataSaved ? 'Data Saved' : 'Save Data'}
                    </button>
                    <button onClick={resetScan} className="px-8 py-4 bg-gradient-to-r from-blue-600 to-blue-500 rounded-full text-white text-base font-medium cursor-pointer transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-blue-500/20">
                        Start New Scan
                    </button>
                </div>
            )}
        </div>
    );
};

const SavedData: React.FC<{ scans: SavedScan[]; onNavigate: (section: Section) => void; }> = ({ scans, onNavigate }) => (
    <div className="w-full text-center">
        <h1 className="text-4xl md:text-5xl font-bold mb-8">Saved Analyses</h1>
        {scans.length === 0 ? (
            <div>
                <p className="text-lg opacity-80 mb-8">You haven't saved any scan data yet.</p>
                <button
                    onClick={() => onNavigate(Section.Scanning)}
                    className="px-8 py-4 bg-gradient-to-r from-blue-600 to-blue-500 rounded-full text-white text-base font-medium cursor-pointer transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-blue-500/20"
                >
                    Go to Scanning
                </button>
            </div>
        ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-7xl mx-auto">
                {scans.map((scan, index) => (
                    <div key={index} className="bg-slate-900/60 p-4 rounded-2xl border border-blue-500/10 flex flex-col gap-4">
                        <img src={scan.image} alt={`Scan from ${scan.timestamp.toLocaleString()}`} className="rounded-xl w-full h-64 object-cover" />
                        <div className="text-left">
                            <h4 className="font-semibold text-lg text-green-400">Analysis Results:</h4>
                            <ul className="text-base opacity-90 mt-2 space-y-1 font-light">
                                <li className="flex justify-between items-baseline"><span>Plankton:</span> <span className="font-semibold">{scan.results.plankton.count.toLocaleString()} <span className="text-xs opacity-70">({(scan.results.plankton.accuracy * 100).toFixed(1)}% acc.)</span></span></li>
                                <li className="flex justify-between items-baseline"><span>Algae:</span> <span className="font-semibold">{scan.results.algae.count.toLocaleString()} <span className="text-xs opacity-70">({(scan.results.algae.accuracy * 100).toFixed(1)}% acc.)</span></span></li>
                                <li className="flex justify-between items-baseline"><span>Bacteria:</span> <span className="font-semibold">{scan.results.bacteria.count.toLocaleString()} <span className="text-xs opacity-70">({(scan.results.bacteria.accuracy * 100).toFixed(1)}% acc.)</span></span></li>
                                <li className="flex justify-between items-baseline"><span>Protozoa:</span> <span className="font-semibold">{scan.results.protozoa.count.toLocaleString()} <span className="text-xs opacity-70">({(scan.results.protozoa.accuracy * 100).toFixed(1)}% acc.)</span></span></li>
                            </ul>
                            <p className="text-xs text-right opacity-60 mt-4">{scan.timestamp.toLocaleString()}</p>
                        </div>
                    </div>
                ))}
            </div>
        )}
    </div>
);


// --- MAIN APP COMPONENT ---
function App() {
  const [currentSection, setCurrentSection] = useState<Section>(Section.Home);
  const [savedScans, setSavedScans] = useState<SavedScan[]>([]);

  const handleNavigate = (section: Section) => {
    if (section === currentSection) return;
    setCurrentSection(section);
  };

  const handleSaveScan = (results: ScanResults, imageFile: File) => {
    const reader = new FileReader();
    reader.readAsDataURL(imageFile);
    reader.onloadend = () => {
      const newScan: SavedScan = {
        results,
        image: reader.result as string,
        timestamp: new Date(),
      };
      setSavedScans(prevScans => [newScan, ...prevScans]);
      alert('Scan data saved successfully!');
    };
    reader.onerror = (error) => {
      console.error('Error converting file to base64:', error);
      alert('Failed to save scan data.');
    };
  };

  const renderSection = () => {
    switch(currentSection) {
      case Section.Home:
        return <Home onNavigate={handleNavigate} />;
      case Section.About:
        return <About />;
      case Section.Scanning:
        return <Scanning onSaveScan={handleSaveScan} />;
      case Section.SavedData:
        return <SavedData scans={savedScans} onNavigate={handleNavigate} />;
      default:
        return <Home onNavigate={handleNavigate} />;
    }
  }

  return (
    <>
      <GlobalStyles />
      <Particles />
      <SwimCanvas id="globalSwim" />
      <Header currentSection={currentSection} onNavigate={handleNavigate} />
      
      <main className="container relative mx-auto p-5 md:p-10 pb-20">
        <SectionContainer id={currentSection} isActive={true}>
          {renderSection()}
        </SectionContainer>
      </main>
    </>
  );
}

export default App;
