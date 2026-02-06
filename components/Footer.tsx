"use client";

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="w-full px-2 sm:px-4 py-2 sm:py-4">
      <div className="max-w-[1200px] mx-auto p-2 sm:p-3 md:p-4 rounded-xl bg-white/[0.08] backdrop-blur-lg border border-white/10">
        <p className="text-xs text-white/60 text-center">
          &copy; {currentYear} - made with love by the{" "}
          <a
            href="https://quizzdle.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-violet-400 hover:text-violet-300 underline hover:no-underline transition-all"
          >
            quizzdle.com
          </a>{" "}
          team
        </p>
      </div>
    </footer>
  );
}
