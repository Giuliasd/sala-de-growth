import { 
  FileText, PenBox, PenTool, Terminal, MessagesSquare, Link2, 
  BookOpen, Video, Image, Monitor, Briefcase, Folder, Globe, 
  Mail, Phone, Map, Compass, Rocket, FlaskConical, Target,
  LayoutDashboard, CalendarRange, Code, User, Users,
  Heart, Star, Zap, Settings, HelpCircle, Info
} from "lucide-react";

export const AVAILABLE_ICONS = {
  FileText, PenBox, PenTool, Terminal, MessagesSquare, Link2, 
  BookOpen, Video, Image, Monitor, Briefcase, Folder, Globe, 
  Mail, Phone, Map, Compass, Rocket, FlaskConical, Target,
  LayoutDashboard, CalendarRange, Code, User, Users,
  Heart, Star, Zap, Settings, HelpCircle, Info
};

export type IconName = keyof typeof AVAILABLE_ICONS;
