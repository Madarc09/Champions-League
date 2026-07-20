import NickLockerRoom from "@/components/NickLockerRoom";

export const metadata = {
  title: "Nick's Locker Room | Champions League",
  description: "Nick's Champions League projected roster inside his custom locker."
};

export default function NickLockerRoomPage() {
  return (
    <>
      <section className="team-hero locker-page-hero">
        <div>
          <a className="back-link" href="/">← Back to standings</a>
          <p className="eyebrow">Nick&apos;s team room</p>
          <h1>Locker Room</h1>
          <p>
            Nick&apos;s saved projected lineup is displayed inside his custom locker using the 2025–26 player statistics.
          </p>
          <nav className="team-room-nav" aria-label="Nick team pages">
            <a href="/team/nick">Draft Room</a>
            <a className="active" href="/team/nick/locker-room" aria-current="page">Locker Room</a>
          </nav>
        </div>
        <div className="manager-crest">N</div>
      </section>

      <NickLockerRoom />
    </>
  );
}
