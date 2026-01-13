
import mongoose from "mongoose";

const personSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  profession: String,
  company: String,
  location: String,
  bio: String,
  source: {
    type: String,
    default: "MongoDB"
  },
  embedding: {
    type: [Number] // for semantic search later
  }
});

export default mongoose.model("Person", personSchema);

//Updated Code for Frontend Fetch
/*import mongoose from "mongoose";

const personSchema = new mongoose.Schema(
  {
    name: String,
    info: String,
    source: String,
  },
  { timestamps: true }
);

export default mongoose.model("Person", personSchema);
*/
