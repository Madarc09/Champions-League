import NickLockerRoom from "@/components/NickLockerRoom";

export const metadata = {
  title: "Nick's Locker Room | Champions League",
  description: "Nick's Champions League projected roster inside his custom locker."
};

export default function NickLockerRoomPage() {
  return (
    <div className="locker-page-root">
      <NickLockerRoom />
    </div>
  );
}
