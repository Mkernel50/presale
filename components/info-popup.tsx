import { Info } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export function InfoPopup() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="p-1 rounded-full hover:bg-white/10 transition-colors">
          <Info className="h-4 w-4 text-white/60" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 bg-black/90 border-white/20 text-white">
        <div className="space-y-4">
          <h4 className="font-medium">Seed NFT Rarity Rates</h4>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-yellow-400">Try Again</span>
              <span>60%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Common</span>
              <span>20%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-green-400">Uncommon</span>
              <span>15%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-blue-400">Rare</span>
              <span>3% x2 Bonus Event</span>
            </div>
            <div className="flex justify-between">
              <span className="text-purple-400">Epic</span>
              <span>2% x2 Bonus Event</span>
            </div>
          </div>
          <div className="space-y-2 text-xs text-white/60">
            <p>Each roll will consume 1 try.</p>
            <p>Get 1 try for every 5 TON spent!</p>
            <p>Higher rarity NFTs may have special benefits in the future.</p>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
