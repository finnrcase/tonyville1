import { MapPinned } from "lucide-react";

export default function Loading() {
  return (
    <main className="min-h-screen bg-[#f7f6f2] text-[#161817]">
      <div className="relative min-h-screen overflow-hidden bg-[#d7dfcf]">
        <div className="absolute left-4 top-4 z-10 flex items-center gap-3 rounded-3xl border border-white/70 bg-white/88 px-4 py-3 shadow-[0_18px_55px_rgba(22,24,23,0.14)] backdrop-blur-2xl">
          <div>
            <div className="text-sm font-semibold uppercase leading-6 tracking-[0.32em] text-[#203b2c]">
              CABN
            </div>
            <div className="mt-2 h-3 w-48 rounded-full bg-[#edf0ec]" />
          </div>
        </div>

        <div className="absolute inset-x-4 bottom-4 top-[92px] z-10 hidden w-[410px] rounded-3xl border border-white/70 bg-white/88 p-4 shadow-[0_22px_70px_rgba(22,24,23,0.15)] backdrop-blur-2xl md:block">
          <div className="h-12 rounded-2xl bg-[#f7f6f2]" />
          <div className="mt-4 grid gap-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                className="h-28 rounded-[24px] bg-[#f7f6f2]"
              />
            ))}
          </div>
        </div>

        <div className="absolute inset-0 flex items-center justify-center">
          <div className="rounded-[28px] border border-white/70 bg-white/92 p-5 text-center shadow-[0_22px_70px_rgba(22,24,23,0.16)] backdrop-blur-xl">
            <MapPinned
              className="mx-auto h-7 w-7 text-[#203b2c]"
              aria-hidden="true"
            />
            <h1 className="mt-3 text-base font-semibold text-[#111817]">
              Loading CABN
            </h1>
            <p className="mt-2 text-sm text-[#66716a]">
              Preparing your room and property experience.
            </p>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#edf0ec]">
              <div className="soft-pulse h-full w-1/2 rounded-full bg-[#b9d7e7]" />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
